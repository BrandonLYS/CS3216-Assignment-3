import { count } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ConflictError, ForbiddenError } from "@/server/core/errors";
import { activityRepo } from "@/server/modules/activity/service";
import { commentsService } from "@/server/modules/comments/service";
import { assumptionsRepo, sourcesRepo } from "@/server/modules/decisions/repository";
import { assumptions, decisionEdges, decisionSources, decisions } from "@/server/modules/decisions/schema";
import { decisionsService } from "@/server/modules/decisions/service";
import type { EvidenceRow } from "@/server/modules/evidence/schema";
import { evidenceService } from "@/server/modules/evidence/service";
import { milestonesService } from "@/server/modules/milestones/service";
import { peopleService } from "@/server/modules/people/service";
import { tasksService } from "@/server/modules/tasks/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { heuristicExtract, type Extract } from "./extract";
import { proposalsRepo } from "./repository";
import { proposalsService } from "./service";

let ctx: Ctx;
let projectId: string;
let minutes: EvidenceRow;
let commentId: string;

const SENTENCE = "After the pilot we decided to switch from weekly surveys to fortnightly interviews.";

beforeAll(async () => {
  ctx = await makeCtx();
  projectId = (await makeProject(ctx, "PRP")).id;
  await peopleService.createPerson(ctx, { projectId, name: "Priya Nair" });
  await milestonesService.create(ctx, { projectId, name: "UAT begins", dueDate: "2026-10-05" });
  const task = await tasksService.create(ctx, { projectId, title: "Recruit interviewees", priority: "none" });
  minutes = await evidenceService.create(ctx, {
    projectId,
    title: "Steering call notes",
    kind: "minutes",
    body: `Attendees: Priya, Marcus.\n\n${SENTENCE} The vendor sandbox is still pending.`,
  });
  commentId = (
    await commentsService.create(ctx, {
      projectId,
      entityType: "task",
      entityId: task.id,
      body: "We agreed to recruit through the alumni list instead of a public call.",
    })
  ).id;
});
afterAll(closeDb);

const graphCounts = async () => {
  const [[d], [a], [e], [s]] = await Promise.all([
    ctx.db.select({ n: count() }).from(decisions),
    ctx.db.select({ n: count() }).from(assumptions),
    ctx.db.select({ n: count() }).from(decisionEdges),
    ctx.db.select({ n: count() }).from(decisionSources),
  ]);
  return [d!.n, a!.n, e!.n, s!.n];
};

describe("proposalsService.runPass", () => {
  it("proposes traceable Decisions from Evidence and Comments, never touching the graph, and is idempotent", async () => {
    const before = await graphCounts();
    const out = await proposalsService.runPass(ctx, projectId, { extract: heuristicExtract });
    expect(out).toMatchObject({ sourcesPassed: 2, proposed: 2, discarded: 0 });
    expect(await graphCounts()).toEqual(before);

    const pending = await proposalsService.listPending(ctx, projectId);
    expect(pending.map((p) => p.title).sort()).toEqual([
      "Recruit through the alumni list instead of a public call",
      "Switch from weekly surveys to fortnightly interviews",
    ]);
    const fromMinutes = pending.find((p) => p.sources[0]!.entityId === minutes.id)!;
    expect(fromMinutes.sources).toEqual([{ kind: "evidence", entityId: minutes.id, excerpt: SENTENCE }]);
    expect(pending.find((p) => p.sources[0]!.entityId === commentId)?.alternatives).toBe("a public call");

    expect(await proposalsService.runPass(ctx, projectId, { extract: heuristicExtract })).toEqual({
      skipped: "nothing_new",
    });
    expect(await proposalsService.listPending(ctx, projectId)).toHaveLength(2);
  });

  it("discards output whose Source or excerpt is not traceable", async () => {
    const other = await makeProject(ctx, "TRC");
    await evidenceService.create(ctx, { projectId: other.id, title: "Plan", kind: "plan", body: "We chose Postgres." });
    const fabricating: Extract = async ({ sources }) => ({
      proposals: [
        {
          title: "Real",
          chosen: "Postgres",
          sources: [{ kind: "evidence", entityId: sources[0]!.entityId, excerpt: "we chose postgres" }],
          assumptions: [],
        },
        {
          title: "Fake excerpt",
          chosen: "x",
          sources: [{ kind: "evidence", entityId: sources[0]!.entityId, excerpt: "we chose MySQL" }],
          assumptions: [],
        },
        {
          title: "Fake source",
          chosen: "x",
          sources: [{ kind: "evidence", entityId: minutes.id, excerpt: SENTENCE }],
          assumptions: [],
        },
      ],
    });
    const out = await proposalsService.runPass(ctx, other.id, { extract: fabricating });
    expect(out).toMatchObject({ proposed: 1, discarded: 2 });
    expect((await proposalsService.listPending(ctx, other.id)).map((p) => p.title)).toEqual(["Real"]);
  });

  it("re-passes edited Evidence but never resurrects a rejected Proposal", async () => {
    const p = await makeProject(ctx, "REJ");
    const ev = await evidenceService.create(ctx, {
      projectId: p.id,
      title: "Notes",
      kind: "minutes",
      body: "We decided to ship on Friday.",
    });
    await proposalsService.runPass(ctx, p.id, { extract: heuristicExtract });
    const [prop] = await proposalsService.listPending(ctx, p.id);
    await proposalsService.reject(ctx, prop!.id);
    expect(await proposalsService.listPending(ctx, p.id)).toHaveLength(0);
    await evidenceService.update(ctx, { id: ev.id, body: "We decided to ship on Friday. Lunch was late." });
    const out = await proposalsService.runPass(ctx, p.id, { extract: heuristicExtract });
    expect(out).toMatchObject({ sourcesPassed: 1, proposed: 0 });
    expect(await proposalsService.listPending(ctx, p.id)).toHaveLength(0);
    expect(await proposalsService.stats(ctx, p.id)).toMatchObject({ proposed: 1, rejected: 1, accepted: 0, rate: 0 });
  });

  it("falls back to the heuristic without a model and honours PROPOSALS_EXTRACTOR", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("PROPOSALS_EXTRACTOR", "");
    expect(proposalsService.enabled()).toBe(true);
    const p = await makeProject(ctx, "ENV");
    await evidenceService.create(ctx, {
      projectId: p.id,
      title: "N",
      kind: "minutes",
      body: "We agreed to pause hiring.",
    });
    expect(await proposalsService.runPass(ctx, p.id)).toMatchObject({ extractor: "heuristic", proposed: 1 });
    vi.stubEnv("PROPOSALS_EXTRACTOR", "model");
    expect(proposalsService.enabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("accept and reject", () => {
  it("accept writes a Decision through the service under via assistant, keeps the excerpt, creates Assumptions, marks the Proposal", async () => {
    const p = await makeProject(ctx, "ACC");
    await peopleService.createPerson(ctx, { projectId: p.id, name: "Priya Nair" });
    const m = await milestonesService.create(ctx, { projectId: p.id, name: "UAT begins", dueDate: "2026-10-05" });
    const ev = await evidenceService.create(ctx, {
      projectId: p.id,
      title: "Minutes",
      kind: "minutes",
      body: `Intro.\n${SENTENCE}`,
    });
    const withAssumptions: Extract = async () => ({
      proposals: [
        {
          title: "Switch to interviews",
          chosen: "Interviews",
          decidedOn: "2026-09-10",
          sources: [{ kind: "evidence", entityId: ev.id, excerpt: SENTENCE }],
          assumptions: [
            { statement: "Priya stays on the project", subtype: "person", targetName: "Priya Nair" },
            {
              statement: "Data lands before UAT",
              subtype: "date",
              targetName: "UAT begins",
              assumedUntil: "2026-10-01",
            },
            { statement: "Nobody", subtype: "person", targetName: "Ghost" },
          ],
        },
      ],
    });
    await proposalsService.runPass(ctx, p.id, { extract: withAssumptions });
    const [prop] = await proposalsService.listPending(ctx, p.id);
    expect(prop!.assumptions).toHaveLength(2);

    const decision = await proposalsService.accept(ctx, {
      id: prop!.id,
      overrides: { title: "Interviews, not surveys" },
    });
    expect(decision.title).toBe("Interviews, not surveys");
    expect(decision.decidedOn).toBe("2026-09-10");
    const events = await activityRepo.forEntity(ctx.db, decision.id);
    const created = events.find((e) => e.event.action === "created")!;
    expect(created.event.via).toBe("assistant");
    expect(created.event.actorId).toBe(ctx.userId);
    expect((await sourcesRepo.listForDecisions(ctx.db, [decision.id]))[0]).toMatchObject({
      entityId: ev.id,
      excerpt: SENTENCE,
    });
    const list = await decisionsService.list(ctx, p.id);
    const item = list.find((x) => x.decision.id === decision.id)!;
    expect(item.assumptions.map((a) => a.statement).sort()).toEqual([
      "Data lands before UAT",
      "Priya stays on the project",
    ]);
    expect(item.assumptions.find((a) => a.subtype === "date")).toMatchObject({
      targetId: m.id,
      targetField: "dueDate",
      assumedUntil: "2026-10-01",
    });
    const after = (await proposalsRepo.findById(ctx.db, prop!.id))!;
    expect(after).toMatchObject({ status: "accepted", decisionId: decision.id });
    expect(after.resolvedAt).toBeInstanceOf(Date);
    await expect(proposalsService.accept(ctx, { id: prop!.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(proposalsService.reject(ctx, prop!.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await proposalsService.stats(ctx, p.id)).toMatchObject({ proposed: 1, accepted: 1, rate: 1 });
  });

  it("the dialog path (decisionsService.create with proposalId) also marks the Proposal and attributes to the Assistant", async () => {
    const p = await makeProject(ctx, "DLG");
    const ev = await evidenceService.create(ctx, {
      projectId: p.id,
      title: "Minutes",
      kind: "minutes",
      body: SENTENCE,
    });
    await proposalsService.runPass(ctx, p.id, { extract: heuristicExtract });
    const [prop] = await proposalsService.listPending(ctx, p.id);
    const d = await decisionsService.create(
      { ...ctx, via: "assistant" },
      {
        projectId: p.id,
        title: "Edited title",
        decidedOn: "2026-09-12",
        chosen: "Edited chosen",
        sources: prop!.sources,
        proposalId: prop!.id,
        assumptions: [{ statement: "IRB allows recordings", subtype: "external_rule" }],
      },
    );
    expect(await proposalsRepo.findById(ctx.db, prop!.id)).toMatchObject({ status: "accepted", decisionId: d.id });
    expect((await activityRepo.forEntity(ctx.db, d.id)).find((e) => e.event.action === "created")?.event.via).toBe(
      "assistant",
    );
    expect(await assumptionsRepo.listByProject(ctx.db, p.id)).toHaveLength(1);
    await expect(
      decisionsService.create(ctx, {
        projectId: p.id,
        title: "again",
        decidedOn: "2026-09-12",
        chosen: "x",
        sources: prop!.sources,
        proposalId: prop!.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    void ev;
  });

  it("refuses every entry point to a stranger", async () => {
    const stranger = await makeCtx();
    const [prop] = await proposalsService.listPending(ctx, projectId);
    await expect(proposalsService.runPass(stranger, projectId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(proposalsService.listPending(stranger, projectId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(proposalsService.stats(stranger, projectId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(proposalsService.accept(stranger, { id: prop!.id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(proposalsService.reject(stranger, prop!.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

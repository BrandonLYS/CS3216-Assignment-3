import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ConflictError } from "@/server/core/errors";
import { decisionsService } from "@/server/modules/decisions/service";
import { evidenceService } from "@/server/modules/evidence/service";
import { capture } from "@/shared/analytics/server";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { heuristicExtract, type Extract } from "./extract";
import type { ProposalRow } from "./schema";
import { proposalsService } from "./service";

vi.mock("@/shared/analytics/server", () => ({ capture: vi.fn(), captureCurrent: vi.fn() }));

/**
 * The funnel events themselves (issue #74): which transitions emit, what they count and how the
 * edit decision is reached. `capture` is the seam; the real services and database do the rest.
 */

const SENTENCE = "After the pilot we decided to switch from weekly surveys to fortnightly interviews.";
const OTHER = "We agreed to run the retro fortnightly instead of weekly.";

let ctx: Ctx;

const events = (name?: string) =>
  vi
    .mocked(capture)
    .mock.calls.filter(([, event]) => !name || event === name)
    .map(([userId, event, properties]) => ({ userId, event, properties: properties ?? {} }));

/** What the review form posts for a Proposal nobody touched: the same fields, resolved the same way. */
const asSubmitted = (p: ProposalRow) => ({
  projectId: p.projectId,
  title: p.title,
  decidedOn: p.decidedOn ?? "2026-09-22",
  context: p.context,
  chosen: p.chosen,
  alternatives: p.alternatives,
  revisitWhen: p.revisitWhen,
  sources: p.sources,
  assumptions: p.assumptions.map((a) => ({
    statement: a.statement,
    subtype: a.subtype,
    targetType: a.targetType ?? null,
    targetId: a.targetId ?? null,
    targetField: a.targetField ?? null,
    assumedUntil: a.assumedUntil ?? null,
  })),
  proposalId: p.id,
});

async function projectWithOneProposal(key: string, body = SENTENCE) {
  const project = await makeProject(ctx, key);
  await evidenceService.create(ctx, { projectId: project.id, title: "Minutes", kind: "minutes", body });
  await proposalsService.runPass(ctx, project.id, { extract: heuristicExtract });
  const [proposal] = await proposalsService.listPending(ctx, project.id);
  return { projectId: project.id, proposal: proposal! };
}

beforeAll(async () => {
  ctx = await makeCtx();
});
afterAll(closeDb);
beforeEach(() => vi.mocked(capture).mockClear());

describe("generation", () => {
  it("records one event per pass with the Proposals it really created", async () => {
    const project = await makeProject(ctx, "GEN");
    await evidenceService.create(ctx, { projectId: project.id, title: "Minutes", kind: "minutes", body: SENTENCE });
    await proposalsService.runPass(ctx, project.id, { extract: heuristicExtract });

    expect(events("proposal_generated")).toHaveLength(1);
    expect(events("proposal_generated")[0]).toMatchObject({
      userId: ctx.userId,
      properties: { project_id: project.id, extractor: "heuristic", proposal_count: 1, source_count: 1 },
    });
  });

  it("stays silent when a pass finds nothing new", async () => {
    const { projectId } = await projectWithOneProposal("NEW");
    vi.mocked(capture).mockClear();

    expect(await proposalsService.runPass(ctx, projectId, { extract: heuristicExtract })).toEqual({
      skipped: "nothing_new",
    });
    expect(events()).toEqual([]);
  });

  it("stays silent when no extractor is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("PROPOSALS_EXTRACTOR", "model");
    const project = await makeProject(ctx, "CFG");
    await evidenceService.create(ctx, { projectId: project.id, title: "Minutes", kind: "minutes", body: SENTENCE });

    expect(await proposalsService.runPass(ctx, project.id)).toEqual({ skipped: "not_configured" });
    expect(events()).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("stays silent when the extractor throws", async () => {
    const project = await makeProject(ctx, "ERR");
    await evidenceService.create(ctx, { projectId: project.id, title: "Minutes", kind: "minutes", body: SENTENCE });
    const failing: Extract = async () => {
      throw new Error("extractor unavailable");
    };

    expect(await proposalsService.runPass(ctx, project.id, { extract: failing })).toEqual({ skipped: "failed" });
    expect(events()).toEqual([]);
  });

  it("stays silent when nothing the extractor returned was traceable", async () => {
    const project = await makeProject(ctx, "UNT");
    const ev = await evidenceService.create(ctx, {
      projectId: project.id,
      title: "Minutes",
      kind: "minutes",
      body: SENTENCE,
    });
    const fabricating: Extract = async () => ({
      proposals: [
        {
          title: "Invented",
          decidedOn: null,
          context: null,
          chosen: "x",
          alternatives: null,
          revisitWhen: null,
          sources: [{ kind: "evidence", entityId: ev.id, excerpt: "a sentence nobody wrote" }],
          assumptions: [],
        },
      ],
    });

    expect(await proposalsService.runPass(ctx, project.id, { extract: fabricating })).toMatchObject({
      proposed: 0,
      discarded: 1,
    });
    expect(events()).toEqual([]);
  });

  it("never counts a Proposal twice when two passes run over the same Sources", async () => {
    const project = await makeProject(ctx, "RCE");
    await evidenceService.create(ctx, { projectId: project.id, title: "Minutes", kind: "minutes", body: SENTENCE });

    await Promise.all([
      proposalsService.runPass(ctx, project.id, { extract: heuristicExtract }),
      proposalsService.runPass(ctx, project.id, { extract: heuristicExtract }),
    ]);

    const persisted = await proposalsService.stats(ctx, project.id);
    const counted = events("proposal_generated").reduce((n, e) => n + Number(e.properties.proposal_count), 0);
    expect(counted).toBe(persisted.proposed);
  });
});

describe("acceptance and rejection", () => {
  it("records a one-click accept as unedited", async () => {
    const { projectId, proposal } = await projectWithOneProposal("ONE");
    vi.mocked(capture).mockClear();

    await proposalsService.accept(ctx, { id: proposal.id });

    expect(events("proposal_accepted")).toHaveLength(1);
    expect(events("proposal_accepted")[0]).toMatchObject({
      userId: ctx.userId,
      properties: { project_id: projectId, proposal_id: proposal.id, edited_before_accept: false },
    });
  });

  it("records the review form submitted unchanged as unedited", async () => {
    const { proposal } = await projectWithOneProposal("FRM");
    vi.mocked(capture).mockClear();

    await decisionsService.create({ ...ctx, via: "assistant" }, asSubmitted(proposal));

    expect(events("proposal_accepted")[0]?.properties).toMatchObject({
      proposal_id: proposal.id,
      edited_before_accept: false,
    });
  });

  it("records changed content, dropped Sources and dropped Assumptions as edited", async () => {
    const changed = await projectWithOneProposal("EDT");
    await decisionsService.create(
      { ...ctx, via: "assistant" },
      { ...asSubmitted(changed.proposal), chosen: "Fortnightly interviews, run by the research team" },
    );
    expect(events("proposal_accepted")[0]?.properties).toMatchObject({ edited_before_accept: true });

    vi.mocked(capture).mockClear();
    const overridden = await projectWithOneProposal("OVR");
    await proposalsService.accept(ctx, { id: overridden.proposal.id, overrides: { title: "Interviews, not surveys" } });
    expect(events("proposal_accepted")[0]?.properties).toMatchObject({ edited_before_accept: true });

    vi.mocked(capture).mockClear();
    const resourced = await projectWithOneProposal("SRC", `${SENTENCE}\n\n${OTHER}`);
    const submitted = asSubmitted(resourced.proposal);
    const evidenceId = submitted.sources[0]!.entityId;
    await decisionsService.create(
      { ...ctx, via: "assistant" },
      { ...submitted, sources: [{ kind: "evidence", entityId: evidenceId, excerpt: OTHER }] },
    );
    expect(events("proposal_accepted")[0]?.properties).toMatchObject({ edited_before_accept: true });
  });

  it("records a rejection once and nothing for a repeated transition", async () => {
    const { projectId, proposal } = await projectWithOneProposal("REJ");
    vi.mocked(capture).mockClear();

    await proposalsService.reject(ctx, proposal.id);
    expect(events("proposal_rejected")).toHaveLength(1);
    expect(events("proposal_rejected")[0]).toMatchObject({
      properties: { project_id: projectId, proposal_id: proposal.id },
    });

    vi.mocked(capture).mockClear();
    await expect(proposalsService.reject(ctx, proposal.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(proposalsService.accept(ctx, { id: proposal.id })).rejects.toBeInstanceOf(ConflictError);
    expect(events()).toEqual([]);
  });

  it("keeps Evidence text, excerpts, titles and Assumption statements out of every payload", async () => {
    const { proposal } = await projectWithOneProposal("PII");
    await proposalsService.accept(ctx, { id: proposal.id });

    const payload = JSON.stringify(events());
    for (const secret of [SENTENCE, proposal.title, proposal.chosen, "Minutes"]) {
      expect(payload).not.toContain(secret);
    }
  });
});

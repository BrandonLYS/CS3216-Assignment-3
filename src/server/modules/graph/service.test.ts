import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError, NotFoundError } from "@/server/core/errors";
import type { AssumptionRow, DecisionRow } from "@/server/modules/decisions/schema";
import { decisionsService } from "@/server/modules/decisions/service";
import { dependenciesService } from "@/server/modules/dependencies/service";
import type { EvidenceRow } from "@/server/modules/evidence/schema";
import { evidenceService } from "@/server/modules/evidence/service";
import type { MilestoneRow } from "@/server/modules/milestones/schema";
import { milestonesService } from "@/server/modules/milestones/service";
import type { TaskRow } from "@/server/modules/tasks/schema";
import { tasksService } from "@/server/modules/tasks/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { graphService } from "./service";
import { parseNodeParam } from "./validation";

let ctx: Ctx;
let projectId: string;
let milestone: MilestoneRow;
let first: TaskRow;
let second: TaskRow;
let evidence: EvidenceRow;
let older: DecisionRow;
let assumption: AssumptionRow;

beforeAll(async () => {
  ctx = await makeCtx();
  projectId = (await makeProject(ctx, "GRP")).id;
  milestone = await milestonesService.create(ctx, { projectId, name: "UAT begins", dueDate: "2026-10-05" });
  first = await tasksService.create(ctx, { projectId, title: "Load-test the gateway", priority: "none" });
  second = await tasksService.create(ctx, { projectId, title: "Sign off", priority: "none" });
  await dependenciesService.create(ctx, {
    projectId,
    predecessorType: "task",
    predecessorId: first.id,
    successorType: "task",
    successorId: second.id,
  });
  evidence = await evidenceService.create(ctx, {
    projectId,
    title: "Kickoff minutes",
    kind: "minutes",
    body: "agreed",
  });
  older = await decisionsService.create(ctx, {
    projectId,
    title: "Switch to interviews",
    decidedOn: "2026-09-01",
    chosen: "Interviews",
    sources: [{ kind: "evidence", entityId: evidence.id }],
  });
  assumption = await decisionsService.createAssumption(ctx, {
    projectId,
    decisionId: older.id,
    statement: "Dataset arrives before UAT",
    subtype: "date",
    targetType: "milestone",
    targetId: milestone.id,
    targetField: "dueDate",
    assumedUntil: "2026-10-01",
  });
  await decisionsService.addConsequence(ctx, { decisionId: older.id, targetType: "task", targetId: first.id });
  await decisionsService.create(ctx, {
    projectId,
    title: "Interviews plus a survey",
    decidedOn: "2026-09-15",
    chosen: "Both",
    sources: [{ kind: "evidence", entityId: evidence.id }],
    supersedesId: older.id,
  });
  await decisionsService.breakAssumption(ctx, { id: assumption.id, reason: "Marked broken by hand" });
});

afterAll(closeDb);

describe("graphService.neighbourhood", () => {
  it("describes the centre, both sides, edge Sources with hrefs and the broken path", async () => {
    const g = await graphService.neighbourhood(ctx, { projectId, centre: { type: "decision", id: older.id } });
    expect(g.centre).toMatchObject({
      type: "decision",
      label: "Switch to interviews",
      code: "D-1",
      status: "superseded",
      href: `/projects/${projectId}/decisions?decision=${older.id}`,
      onBrokenPath: true,
    });
    expect(g.causes).toEqual([
      expect.objectContaining({
        type: "assumption",
        id: assumption.id,
        label: "Dataset arrives before UAT",
        status: "broken",
        depth: 1,
        onBrokenPath: true,
        href: `/projects/${projectId}/decisions?decision=${older.id}`,
        assumption: expect.objectContaining({ subtype: "date", state: "broken", targetLabel: null }),
      }),
    ]);
    expect(g.consequences.map((n) => [n.code ?? n.label, n.depth])).toEqual([
      ["GRP-1", 1],
      ["D-2", 1],
      ["GRP-2", 2],
    ]);
    expect(g.consequences.find((n) => n.type === "task")?.href).toBe(`/projects/${projectId}/tasks?task=${first.id}`);

    const supports = g.causeEdges[0]!;
    expect(supports).toMatchObject({ kind: "supports", highlighted: true });
    expect(supports.sources).toEqual([
      expect.objectContaining({
        kind: "evidence",
        label: "Kickoff minutes",
        href: `/projects/${projectId}/evidence?item=${evidence.id}#evidence-${evidence.id}`,
      }),
    ]);
    const byKind = Object.fromEntries(g.consequenceEdges.map((e) => [e.kind, e]));
    expect(byKind.leads_to!.sources.map((s) => s.label)).toEqual(["Kickoff minutes"]);
    expect(byKind.superseded_by!.sources).toHaveLength(1);
    expect(byKind.depends_on).toMatchObject({ edgeId: null, sources: [] });
    expect(g.brokenReachesCentre).toBe(true);
  });

  it("centred on the broken Assumption: no causes, the watched Milestone and the Decisions follow", async () => {
    const g = await graphService.neighbourhood(ctx, { projectId, centre: { type: "assumption", id: assumption.id } });
    expect(g.causes).toEqual([]);
    expect(g.centre.onBrokenPath).toBe(false);
    expect(g.consequences.map((n) => n.label)).toEqual([
      "Switch to interviews",
      "UAT begins",
      "Load-test the gateway",
      "Interviews plus a survey",
      "Sign off",
    ]);
    expect(g.consequences.find((n) => n.type === "milestone")?.href).toBe(
      `/projects/${projectId}/timeline?milestone=${milestone.id}`,
    );
    expect(g.consequenceEdges.find((e) => e.kind === "watches")).toMatchObject({ edgeId: null, sources: [] });
  });

  it("rejects a stranger and an unknown or foreign centre", async () => {
    const stranger = await makeCtx();
    await expect(
      graphService.neighbourhood(stranger, { projectId, centre: { type: "decision", id: older.id } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      graphService.neighbourhood(ctx, { projectId, centre: { type: "risk", id: "nope" } }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const other = (await makeProject(ctx, "OTH")).id;
    await expect(
      graphService.neighbourhood(ctx, { projectId: other, centre: { type: "decision", id: older.id } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("parseNodeParam", () => {
  it("accepts centre types only", () => {
    expect(parseNodeParam("decision:abc")).toEqual({ type: "decision", id: "abc" });
    expect(parseNodeParam("assumption:a:b")).toEqual({ type: "assumption", id: "a:b" });
    expect(parseNodeParam("task:abc")).toBeNull();
    expect(parseNodeParam("decision:")).toBeNull();
    expect(parseNodeParam("decision")).toBeNull();
    expect(parseNodeParam(undefined)).toBeNull();
    expect(parseNodeParam(["decision:abc"])).toBeNull();
  });
});

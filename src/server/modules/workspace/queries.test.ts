import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError } from "@/server/core/errors";
import { dependenciesService } from "@/server/modules/dependencies/service";
import { milestonesService } from "@/server/modules/milestones/service";
import { risksService } from "@/server/modules/risks/service";
import { statusesService } from "@/server/modules/statuses/service";
import { tasksService } from "@/server/modules/tasks/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { projectAttention } from "./queries";

const TODAY = "2026-09-15";

let ctx: Ctx;
let projectId: string;

/** Ids of the fixture rows, keyed by their role in the scenario. */
const ids: Record<string, string> = {};

beforeAll(async () => {
  ctx = await makeCtx();
  projectId = (await makeProject(ctx, "ATT")).id;

  const taskStatuses = await statusesService.list(ctx, projectId, "task");
  const blocked = taskStatuses.find((s) => s.category === "blocked")!;
  const done = taskStatuses.find((s) => s.category === "done")!;
  const riskStatuses = await statusesService.list(ctx, projectId, "risk");
  const closed = riskStatuses.find((s) => s.category === "closed")!;

  const mk = async (
    name: string,
    o: { title?: string; start?: string; due?: string; statusId?: string; milestoneId?: string } = {},
  ) => {
    const t = await tasksService.create(ctx, {
      projectId,
      title: o.title ?? name,
      priority: "none",
      startDate: o.start,
      dueDate: o.due,
      statusId: o.statusId,
      milestoneId: o.milestoneId,
    });
    ids[name] = t.id;
    return t;
  };

  await mk("overdue", { due: "2026-09-12" });
  await mk("dueSoon", { due: "2026-09-18" });
  await mk("dueLater", { due: "2026-09-25" });
  await mk("blocked", { statusId: blocked.id });
  await mk("doneLate", { due: "2026-09-01", statusId: done.id });

  const m1 = await milestonesService.create(ctx, { projectId, name: "Slipped checkpoint", dueDate: "2026-09-10" });
  const m2 = await milestonesService.create(ctx, { projectId, name: "Finished checkpoint", dueDate: "2026-09-11" });
  ids.m1 = m1.id;
  ids.m2 = m2.id;
  await mk("m1Open", { milestoneId: m1.id });
  await mk("m2Done", { milestoneId: m2.id, statusId: done.id });

  const r1 = await risksService.create(ctx, { projectId, title: "Open top risk", probability: "high", impact: "high" });
  const r2 = await risksService.create(ctx, {
    projectId,
    title: "Closed top risk",
    probability: "high",
    impact: "high",
    statusId: closed.id,
  });
  ids.r1 = r1.id;
  ids.r2 = r2.id;

  const A = await mk("A", { due: "2026-09-23" });
  const B = await mk("B", { start: "2026-09-18", due: "2026-09-22" });
  const C = await mk("C", { due: "2026-09-23", statusId: done.id });
  const D = await mk("D", { start: "2026-09-18", due: "2026-09-30" });
  const E = await mk("E", { due: "2026-09-23" });
  const F = await mk("F", { due: "2026-09-20" });
  for (const [pred, succ] of [
    [A, B],
    [C, D],
    [E, F],
  ] as const) {
    await dependenciesService.create(ctx, {
      projectId,
      predecessorType: "task",
      predecessorId: pred.id,
      successorType: "task",
      successorId: succ.id,
    });
  }

  await mk("overdueBlocked", { due: "2026-09-12", statusId: blocked.id });
});
afterAll(closeDb);

describe("projectAttention", () => {
  it("seeded project returns the expected groups, membership and order", async () => {
    const r = await projectAttention(ctx, projectId, { today: TODAY });

    expect(r.groups.map((g) => g.rule)).toEqual([
      "task_overdue",
      "dependency_late",
      "milestone_past_open",
      "task_blocked",
      "risk_top",
      "task_due_soon",
    ]);
    const by = (rule: string) => r.groups.find((g) => g.rule === rule)!.items;

    // Overdue: both due 09-12, tie broken by key (ATT-1 before ATT-14).
    expect(by("task_overdue").map((i) => i.entityId)).toEqual([ids.overdue, ids.overdueBlocked]);
    // Dependencies: B slips 5 days (23 vs start 18), F slips 3 days (23 vs due 20) — larger slip first.
    expect(by("dependency_late").map((i) => i.entityId)).toEqual([ids.B, ids.F]);
    expect(by("dependency_late")[0]!.reasons[0]).toBe("Depends on ATT-8, due 23 Sep, after start 18 Sep");
    expect(by("dependency_late")[1]!.reasons[0]).toBe("Depends on ATT-12, due 23 Sep, after due 20 Sep");
    expect(by("milestone_past_open").map((i) => i.entityId)).toEqual([ids.m1]);
    expect(by("task_blocked").map((i) => i.entityId)).toEqual([ids.blocked]);
    expect(by("risk_top").map((i) => i.entityId)).toEqual([ids.r1]);
    expect(by("task_due_soon").map((i) => i.entityId)).toEqual([ids.dueSoon]);

    const both = by("task_overdue").find((i) => i.entityId === ids.overdueBlocked)!;
    expect(both.matched).toEqual(["task_overdue", "task_blocked"]);
    expect(both.reasons).toEqual(["Due 12 Sep, 3 days ago", "Blocked (Blocked)"]);

    expect(r.counts).toEqual({
      task_overdue: 2,
      dependency_late: 2,
      milestone_past_open: 1,
      task_blocked: 1,
      risk_top: 1,
      task_due_soon: 1,
    });

    // Never listed anywhere.
    const all = r.groups.flatMap((g) => g.items.map((i) => i.entityId));
    for (const absent of [ids.dueLater, ids.doneLate, ids.m2, ids.m2Done, ids.r2, ids.C, ids.D, ids.A, ids.E]) {
      expect(all).not.toContain(absent);
    }
  });

  it("rejects a foreign User", async () => {
    const stranger = await makeCtx();
    await expect(projectAttention(stranger, projectId, { today: TODAY })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

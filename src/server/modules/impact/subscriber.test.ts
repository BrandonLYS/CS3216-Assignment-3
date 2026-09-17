import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { activityRepo } from "@/server/modules/activity/service";
import { assumptionsRepo } from "@/server/modules/decisions/repository";
import type { DecisionRow } from "@/server/modules/decisions/schema";
import { decisionsService } from "@/server/modules/decisions/service";
import { dependenciesService } from "@/server/modules/dependencies/service";
import { evidenceService } from "@/server/modules/evidence/service";
import type { MilestoneRow } from "@/server/modules/milestones/schema";
import { milestonesService } from "@/server/modules/milestones/service";
import { peopleService } from "@/server/modules/people/service";
import { statusesRepo } from "@/server/modules/statuses/repository";
import type { TaskRow } from "@/server/modules/tasks/schema";
import { tasksService } from "@/server/modules/tasks/service";
import { projectAttention } from "@/server/modules/workspace/queries";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { impactService } from "./service";
import { registerImpactDetector } from "./subscriber";

let ctx: Ctx;
let projectId: string;
let milestone: MilestoneRow;
let upstream: TaskRow;
let downstream: TaskRow;
let decision: DecisionRow;

beforeAll(async () => {
  registerImpactDetector();
  ctx = await makeCtx();
  projectId = (await makeProject(ctx, "IMP")).id;
  milestone = await milestonesService.create(ctx, { projectId, name: "UAT begins", dueDate: "2026-09-25" });
  upstream = await tasksService.create(ctx, {
    projectId,
    title: "Implement v2",
    priority: "none",
    dueDate: "2026-10-01",
  });
  downstream = await tasksService.create(ctx, {
    projectId,
    title: "Load test",
    priority: "none",
    startDate: "2026-10-10",
    dueDate: "2026-10-30",
  });
  await dependenciesService.create(ctx, {
    projectId,
    predecessorType: "milestone",
    predecessorId: milestone.id,
    successorType: "task",
    successorId: downstream.id,
  });
  const ev = await evidenceService.create(ctx, { projectId, title: "Minutes", kind: "minutes", body: "agreed" });
  decision = await decisionsService.create(ctx, {
    projectId,
    title: "Interviews",
    decidedOn: "2026-09-10",
    chosen: "Interviews",
    sources: [{ kind: "evidence", entityId: ev.id }],
  });
});
afterAll(closeDb);

const dateAssumption = (statement = "Dataset arrives before UAT") =>
  decisionsService.createAssumption(ctx, {
    projectId,
    decisionId: decision.id,
    statement,
    subtype: "date",
    targetType: "milestone",
    targetId: milestone.id,
    targetField: "dueDate",
    assumedUntil: "2026-10-01",
  });

describe("impact detection through real services", () => {
  it("breaks a date Assumption when the Milestone date moves past it, attributed to the system with the trigger", async () => {
    const a = await dateAssumption();
    await milestonesService.update(ctx, { id: milestone.id, name: "UAT begins (renamed)" });
    expect((await assumptionsRepo.findById(ctx.db, a.id))?.state).toBe("holding");
    await milestonesService.update(ctx, { id: milestone.id, dueDate: "2026-09-28" });
    expect((await assumptionsRepo.findById(ctx.db, a.id))?.state).toBe("holding");

    await milestonesService.update(ctx, { id: milestone.id, dueDate: "2026-10-20" });
    const broken = (await assumptionsRepo.findById(ctx.db, a.id))!;
    expect(broken.state).toBe("broken");
    expect(broken.brokenReason).toBe(
      '"UAT begins (renamed)" due date moved from 28 Sep 2026 to 20 Oct 2026, past the assumed 1 Oct 2026',
    );
    const trigger = await activityRepo.findById(ctx.db, broken.brokenByEventId!);
    expect(trigger).toMatchObject({ entityId: milestone.id, field: "dueDate", newValue: "2026-10-20" });
    const history = await activityRepo.forEntity(ctx.db, a.id);
    const breakEvent = history.find((h) => h.event.field === "state");
    expect(breakEvent?.event.via).toBe("system");
    expect(breakEvent?.event.actorId).toBe(ctx.userId);

    const [alert] = (await impactService.listAlerts(ctx, projectId)).filter((x) => x.assumption.id === a.id);
    expect(alert!.decisions.map((d) => d.title)).toEqual(["Interviews"]);
    expect(alert!.decisions[0]!.sources.map((s) => s.label)).toEqual(["Minutes"]);
    expect(alert!.items.map((i) => i.label)).toEqual(["UAT begins (renamed)", "Load test"]);
    expect(alert!.trigger?.newValue).toBe("2026-10-20");

    const attention = await projectAttention(ctx, projectId, { today: "2026-09-17" });
    expect(attention.counts.assumption_broken).toBeGreaterThanOrEqual(1);
    expect(attention.groups[0]!.rule).toBe("assumption_broken");
    expect(attention.groups[0]!.items.some((i) => i.entityId === a.id && i.entityType === "assumption")).toBe(true);

    // Already broken: a further move neither re-breaks nor rewrites the trigger.
    await milestonesService.update(ctx, { id: milestone.id, dueDate: "2026-11-01" });
    expect((await assumptionsRepo.findById(ctx.db, a.id))?.brokenByEventId).toBe(broken.brokenByEventId);
  });

  it("ignores retired Assumptions and dismissal keeps the Assumption broken", async () => {
    await milestonesService.update(ctx, { id: milestone.id, dueDate: "2026-09-20" });
    const retired = await dateAssumption("retired one");
    await decisionsService.retireAssumption(ctx, retired.id);
    const live = await dateAssumption("live one");
    await milestonesService.update(ctx, { id: milestone.id, dueDate: "2026-10-05" });
    expect((await assumptionsRepo.findById(ctx.db, retired.id))?.state).toBe("retired");
    expect((await assumptionsRepo.findById(ctx.db, live.id))?.state).toBe("broken");
    await decisionsService.dismissAlert(ctx, live.id);
    expect((await impactService.listAlerts(ctx, projectId)).some((x) => x.assumption.id === live.id)).toBe(false);
    expect((await assumptionsRepo.findById(ctx.db, live.id))?.state).toBe("broken");
  });

  it("breaks a person Assumption when the Person is removed", async () => {
    const priya = await peopleService.createPerson(ctx, { projectId, name: "Priya Nair" });
    const a = await decisionsService.createAssumption(ctx, {
      projectId,
      decisionId: decision.id,
      statement: "Priya stays",
      subtype: "person",
      targetType: "person",
      targetId: priya.id,
    });
    await peopleService.updatePerson(ctx, { id: priya.id, role: "Research assistant" });
    expect((await assumptionsRepo.findById(ctx.db, a.id))?.state).toBe("holding");
    await peopleService.deletePerson(ctx, priya.id);
    const broken = (await assumptionsRepo.findById(ctx.db, a.id))!;
    expect(broken.state).toBe("broken");
    expect(broken.brokenReason).toBe("Priya Nair was removed from the project");
    expect(broken.brokenByEventId).toBeTruthy();
  });

  it("breaks a dependency Assumption when the predecessor slips past the successor start, or is blocked", async () => {
    const dep = await dependenciesService.create(ctx, {
      projectId,
      predecessorType: "task",
      predecessorId: upstream.id,
      successorType: "task",
      successorId: downstream.id,
    });
    const mk = (statement: string) =>
      decisionsService.createAssumption(ctx, {
        projectId,
        decisionId: decision.id,
        statement,
        subtype: "dependency",
        targetType: "dependency",
        targetId: dep.id,
      });
    const a = await mk("v2 lands before load test");
    await tasksService.update(ctx, { id: upstream.id, dueDate: "2026-10-09" });
    expect((await assumptionsRepo.findById(ctx.db, a.id))?.state).toBe("holding");
    await tasksService.update(ctx, { id: upstream.id, dueDate: "2026-10-15" });
    const broken = (await assumptionsRepo.findById(ctx.db, a.id))!;
    expect(broken.state).toBe("broken");
    expect(broken.brokenReason).toContain("became blocking");
    expect(broken.brokenReason).toContain("15 Oct 2026 is after Load test start 10 Oct 2026");
    const [alert] = (await impactService.listAlerts(ctx, projectId)).filter((x) => x.assumption.id === a.id);
    expect(alert!.items.map((i) => i.label)).toEqual(["Load test"]);

    await tasksService.update(ctx, { id: upstream.id, dueDate: "2026-10-01" });
    const b = await mk("v2 not blocked");
    const blocked = (await statusesRepo.listByProject(ctx.db, projectId, "task")).find(
      (s) => s.category === "blocked",
    )!;
    await tasksService.update(ctx, { id: upstream.id, statusId: blocked.id });
    expect((await assumptionsRepo.findById(ctx.db, b.id))?.brokenReason).toContain("is blocked");
  });

  it("breaks a Task start-date Assumption and a dependency whose successor is a Milestone", async () => {
    const t = await tasksService.create(ctx, {
      projectId,
      title: "Recruit",
      priority: "none",
      startDate: "2026-09-01",
    });
    const a = await decisionsService.createAssumption(ctx, {
      projectId,
      decisionId: decision.id,
      statement: "Recruitment starts in September",
      subtype: "date",
      targetType: "task",
      targetId: t.id,
      targetField: "startDate",
      assumedUntil: "2026-09-30",
    });
    await tasksService.update(ctx, { id: t.id, dueDate: "2026-12-01" });
    expect((await assumptionsRepo.findById(ctx.db, a.id))?.state).toBe("holding");
    await tasksService.update(ctx, { id: t.id, startDate: "2026-10-02" });
    const broken = (await assumptionsRepo.findById(ctx.db, a.id))!;
    expect(broken.state).toBe("broken");
    expect(broken.brokenReason).toBe(
      '"Recruit" start date moved from 1 Sep 2026 to 2 Oct 2026, past the assumed 30 Sep 2026',
    );
    const [alert] = (await impactService.listAlerts(ctx, projectId)).filter((x) => x.assumption.id === a.id);
    expect(alert!.items.map((i) => i.code)).toEqual(["IMP-3"]);

    const m2 = await milestonesService.create(ctx, { projectId, name: "Report due", dueDate: "2026-11-01" });
    const dep = await dependenciesService.create(ctx, {
      projectId,
      predecessorType: "task",
      predecessorId: t.id,
      successorType: "milestone",
      successorId: m2.id,
    });
    const b = await decisionsService.createAssumption(ctx, {
      projectId,
      decisionId: decision.id,
      statement: "Recruitment done before the report",
      subtype: "dependency",
      targetType: "dependency",
      targetId: dep.id,
    });
    await tasksService.update(ctx, { id: t.id, dueDate: "2026-11-05" });
    const b2 = (await assumptionsRepo.findById(ctx.db, b.id))!;
    expect(b2.state).toBe("broken");
    expect(b2.brokenReason).toContain("after Report due due 1 Nov 2026");
    const [alertB] = (await impactService.listAlerts(ctx, projectId)).filter((x) => x.assumption.id === b.id);
    expect(alertB!.items.map((i) => i.label)).toEqual(["Report due"]);
  });
});

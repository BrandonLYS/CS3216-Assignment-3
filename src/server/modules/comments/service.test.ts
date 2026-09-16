import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError, ValidationError } from "@/server/core/errors";
import { eventBus, type DomainEvent } from "@/server/events/bus";
import { activityRepo } from "@/server/modules/activity/service";
import type { MilestoneRow } from "@/server/modules/milestones/schema";
import { milestonesService } from "@/server/modules/milestones/service";
import type { PersonRow } from "@/server/modules/people/schema";
import { peopleService } from "@/server/modules/people/service";
import type { ProjectRow } from "@/server/modules/projects/schema";
import type { RiskRow } from "@/server/modules/risks/schema";
import { risksService } from "@/server/modules/risks/service";
import type { TaskRow } from "@/server/modules/tasks/schema";
import { tasksService } from "@/server/modules/tasks/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { COMMENT_LABEL_MAX, commentLabel, commentsService } from "./service";
import type { CreateCommentInput } from "./validation";

let ctx: Ctx;
let project: ProjectRow;
let projectId: string;
let jason: PersonRow;
let task: TaskRow;
let risk: RiskRow;
let milestone: MilestoneRow;

beforeAll(async () => {
  ctx = await makeCtx();
  project = await makeProject(ctx);
  projectId = project.id;
  jason = await peopleService.createPerson(ctx, { projectId, name: "Jason Tan" });
  task = await tasksService.create(ctx, { projectId, title: "Integrate gateway", priority: "none" });
  risk = await risksService.create(ctx, { projectId, title: "Vendor slips", probability: "medium", impact: "medium" });
  milestone = await milestonesService.create(ctx, { projectId, name: "UAT begins", dueDate: "2026-10-01" });
});
afterAll(closeDb);

const mk = (over: Partial<CreateCommentInput> = {}) =>
  commentsService.create(ctx, {
    projectId,
    entityType: "task",
    entityId: task.id,
    body: "Jason said integration lands next week.",
    ...over,
  });

describe("commentLabel", () => {
  it("uses the first non-empty line, skipping leading blank lines", () => {
    expect(commentLabel("KEY-1", "\n  \n\nReal first line\nSecond")).toBe("KEY-1: Real first line");
  });

  it("falls back to a placeholder when the body has no non-empty line", () => {
    expect(commentLabel("KEY-1", "\n \n")).toBe("KEY-1: (no preview)");
    expect(commentLabel("KEY-1", "")).toBe("KEY-1: (no preview)");
  });

  it("truncates by code point so emoji are never split into lone surrogates", () => {
    const body = "🚀🎉".repeat(40); // 80 code points, 160 UTF-16 units
    const label = commentLabel("KEY-1", body);
    expect(label.endsWith("…")).toBe(true);
    expect(label).toBe(Array.from(label).join(""));
    expect(label).not.toMatch(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/);
    expect(Array.from(label.slice("KEY-1: ".length)).length).toBe(COMMENT_LABEL_MAX);
  });

  it("leaves a short first line untouched", () => {
    expect(commentLabel("R-3", "short")).toBe("R-3: short");
  });
});

describe("commentsService", () => {
  it("creates a Comment on a Task, a Risk and a Milestone and lists them oldest first", async () => {
    const t = await tasksService.create(ctx, { projectId, title: "Listed", priority: "none" });
    const attributed = { saidById: jason.id, saidOn: "2026-09-12" };
    await mk({ entityId: t.id, body: "First on task", ...attributed });
    await mk({ entityId: t.id, body: "Second on task" });
    await mk({ entityType: "risk", entityId: risk.id, body: "On risk", ...attributed });
    await mk({ entityType: "milestone", entityId: milestone.id, body: "On milestone", ...attributed });

    const onTask = await commentsService.listForEntity(ctx, { projectId, entityType: "task", entityId: t.id });
    expect(onTask.map((c) => c.comment.body)).toEqual(["First on task", "Second on task"]);
    expect(onTask[0]).toMatchObject({
      comment: { saidOn: "2026-09-12", authorId: ctx.userId },
      saidBy: { id: jason.id, name: "Jason Tan" },
    });
    expect(onTask[1]!.saidBy).toBeNull();

    const onRisk = await commentsService.listForEntity(ctx, { projectId, entityType: "risk", entityId: risk.id });
    expect(onRisk).toHaveLength(1);
    expect(onRisk[0]!.comment.body).toBe("On risk");
    expect(onRisk[0]!.saidBy?.name).toBe("Jason Tan");

    const onMilestone = await commentsService.listForEntity(ctx, {
      projectId,
      entityType: "milestone",
      entityId: milestone.id,
    });
    expect(onMilestone).toHaveLength(1);
    expect(onMilestone[0]!.comment.body).toBe("On milestone");
  });

  it("rejects an item that does not exist", async () => {
    await expect(mk({ entityId: randomUUID() })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an item that belongs to a different Project", async () => {
    const other = await makeProject(ctx, "OTH");
    const foreignTask = await tasksService.create(ctx, { projectId: other.id, title: "Elsewhere", priority: "none" });
    await expect(mk({ entityId: foreignTask.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects saidById from another Project", async () => {
    const other = await makeProject(ctx, "OTP");
    const outsider = await peopleService.createPerson(ctx, { projectId: other.id, name: "Outsider" });
    const err = await mk({ saidById: outsider.id }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors.saidById).toBeDefined();
  });

  it("rejects a blank or whitespace-only body", async () => {
    await expect(mk({ body: "   \n" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a body longer than 4,000 characters", async () => {
    await expect(mk({ body: "x".repeat(4001) })).rejects.toBeInstanceOf(ValidationError);
    const ok = await mk({ body: "x".repeat(4000) });
    expect(ok.body).toHaveLength(4000);
  });

  it("records a comment.created Activity Event and publishes a comment.created domain event", async () => {
    const received: DomainEvent[] = [];
    const unsub = eventBus.subscribe("comment.created", (e) => void received.push(e));
    const body = "Vendor confirmed 17 Sep in Friday's meeting.\nSecond line is not in the label.";
    const comment = await mk({ body, saidById: jason.id, saidOn: "2026-09-12" });
    unsub();

    const history = await activityRepo.forEntity(ctx.db, comment.id);
    expect(history).toHaveLength(1);
    const ev = history[0]!.event;
    expect(ev).toMatchObject({ action: "created", entityType: "comment", entityId: comment.id, field: null });
    expect(ev.entityLabel.startsWith(`${project.key}-${task.number}: `)).toBe(true);
    expect(ev.entityLabel).not.toContain("Second line");
    expect(ev.newValue).toMatchObject({
      body,
      entityType: "task",
      entityId: task.id,
      saidById: jason.id,
      saidByName: "Jason Tan",
      saidOn: "2026-09-12",
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ entityType: "comment", entityId: comment.id, action: "created" });
  });

  it("delete writes a deleted Activity Event containing the body and publishes comment.deleted", async () => {
    const body = "Posted on the wrong item.";
    const comment = await mk({ body });
    const received: DomainEvent[] = [];
    const unsub = eventBus.subscribe("comment.deleted", (e) => void received.push(e));
    await commentsService.delete(ctx, comment.id);
    unsub();

    const history = await activityRepo.forEntity(ctx.db, comment.id);
    const deleted = history.find((h) => h.event.action === "deleted")!.event;
    expect(deleted.entityType).toBe("comment");
    expect(deleted.oldValue).toMatchObject({ body, entityType: "task", entityId: task.id });

    const list = await commentsService.listForEntity(ctx, { projectId, entityType: "task", entityId: task.id });
    expect(list.some((c) => c.comment.id === comment.id)).toBe(false);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ entityType: "comment", entityId: comment.id });
  });

  it("deleting a Task, Risk or Milestone deletes its Comments", async () => {
    const t = await tasksService.create(ctx, { projectId, title: "Doomed task", priority: "none" });
    const r = await risksService.create(ctx, { projectId, title: "Doomed risk", probability: "low", impact: "low" });
    const m = await milestonesService.create(ctx, { projectId, name: "Doomed milestone", dueDate: "2026-11-01" });
    await mk({ entityId: t.id });
    await mk({ entityType: "risk", entityId: r.id });
    await mk({ entityType: "milestone", entityId: m.id });

    await tasksService.delete(ctx, t.id);
    await risksService.delete(ctx, r.id);
    await milestonesService.delete(ctx, m.id);

    expect(await commentsService.listForEntity(ctx, { projectId, entityType: "task", entityId: t.id })).toEqual([]);
    expect(await commentsService.listForEntity(ctx, { projectId, entityType: "risk", entityId: r.id })).toEqual([]);
    expect(await commentsService.listForEntity(ctx, { projectId, entityType: "milestone", entityId: m.id })).toEqual(
      [],
    );
  });

  it("removing a Person nulls saidById but keeps the Comment and its snapshot name", async () => {
    const contractor = await peopleService.createPerson(ctx, { projectId, name: "Temp Contractor" });
    const t = await tasksService.create(ctx, { projectId, title: "Survivor", priority: "none" });
    const comment = await mk({ entityId: t.id, saidById: contractor.id, body: "Said by a contractor" });
    await peopleService.deletePerson(ctx, contractor.id);

    const list = await commentsService.listForEntity(ctx, { projectId, entityType: "task", entityId: t.id });
    expect(list).toHaveLength(1);
    expect(list[0]!.comment.id).toBe(comment.id);
    expect(list[0]!.comment.saidById).toBeNull();
    expect(list[0]!.saidBy).toBeNull();
    expect(list[0]!.comment.saidByName).toBe("Temp Contractor");
  });

  it("tasksService.list reports commentCount per Task", async () => {
    const a = await tasksService.create(ctx, { projectId, title: "Discussed", priority: "none" });
    const b = await tasksService.create(ctx, { projectId, title: "Quiet", priority: "none" });
    await mk({ entityId: a.id, body: "One" });
    await mk({ entityId: a.id, body: "Two" });

    const rows = await tasksService.list(ctx, projectId);
    expect(rows.find((r) => r.task.id === a.id)?.commentCount).toBe(2);
    expect(rows.find((r) => r.task.id === b.id)?.commentCount).toBe(0);
    expect((await tasksService.get(ctx, a.id))?.commentCount).toBe(2);
  });

  it("commentCount is scoped to the Project: Comments elsewhere never change this Project's counts", async () => {
    const a = await tasksService.create(ctx, { projectId, title: "Scoped", priority: "none" });
    await mk({ entityId: a.id, body: "Only one here" });
    const before = await tasksService.list(ctx, projectId);

    const other = await makeProject(ctx, "SCP");
    const foreign = await tasksService.create(ctx, { projectId: other.id, title: "Chatty", priority: "none" });
    await mk({ projectId: other.id, entityId: foreign.id, body: "One" });
    await mk({ projectId: other.id, entityId: foreign.id, body: "Two" });

    const after = await tasksService.list(ctx, projectId);
    expect(after.map((r) => [r.task.id, r.commentCount])).toEqual(before.map((r) => [r.task.id, r.commentCount]));
    expect(after.find((r) => r.task.id === a.id)?.commentCount).toBe(1);
    expect((await tasksService.get(ctx, a.id))?.commentCount).toBe(1);
    expect((await tasksService.list(ctx, other.id)).find((r) => r.task.id === foreign.id)?.commentCount).toBe(2);
  });

  it("refuses a foreign User creating, listing or deleting", async () => {
    const stranger = await makeCtx();
    const mine = await mk({ body: "Owner only" });
    await expect(
      commentsService.create(stranger, { projectId, entityType: "task", entityId: task.id, body: "Intruder" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      commentsService.listForEntity(stranger, { projectId, entityType: "task", entityId: task.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(commentsService.delete(stranger, mine.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

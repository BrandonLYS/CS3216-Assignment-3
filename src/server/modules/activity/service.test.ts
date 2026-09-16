import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError } from "@/server/core/errors";
import { commentsService } from "@/server/modules/comments/service";
import type { LabelRow } from "@/server/modules/labels/schema";
import { labelsService } from "@/server/modules/labels/service";
import type { MilestoneRow } from "@/server/modules/milestones/schema";
import { milestonesService } from "@/server/modules/milestones/service";
import type { PersonRow, TeamRow } from "@/server/modules/people/schema";
import { peopleService } from "@/server/modules/people/service";
import type { StatusRow } from "@/server/modules/statuses/schema";
import { statusesService } from "@/server/modules/statuses/service";
import type { TaskRow } from "@/server/modules/tasks/schema";
import { tasksService } from "@/server/modules/tasks/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import type { HistoryEntry } from "./enrich";
import { activityEvents } from "./schema";
import { activityRepo, activityService } from "./service";

let ctx: Ctx;
let projectId: string;
let priya: PersonRow;
let team: TeamRow;
let qa: StatusRow;
let todo: StatusRow;
let label: LabelRow;
let ms: MilestoneRow;
let task: TaskRow;
let history: HistoryEntry[];

const listFor = (entityId: string) =>
  activityService.listEntityHistory(ctx, { projectId, entityType: "task", entityId });

beforeAll(async () => {
  ctx = await makeCtx();
  projectId = (await makeProject(ctx)).id;
  priya = await peopleService.createPerson(ctx, { projectId, name: "Priya Nair" });
  team = await peopleService.createTeam(ctx, { projectId, name: "Team B" });
  qa = await statusesService.create(ctx, {
    projectId,
    scope: "task",
    category: "in_progress",
    name: "In QA",
    color: "#f2c94c",
  });
  label = await labelsService.create(ctx, { projectId, name: "backend", color: "#4ea7fc" });
  ms = await milestonesService.create(ctx, { projectId, name: "UAT begins", dueDate: "2026-10-05" });
  todo = (await statusesService.list(ctx, projectId, "task")).find((s) => s.isDefault)!;

  task = await tasksService.create(ctx, { projectId, title: "Slips", priority: "none", dueDate: "2026-09-18" });
  await tasksService.update(ctx, { id: task.id, statusId: qa.id, assigneeId: priya.id, dueDate: "2026-09-23" });
  await tasksService.update(ctx, { id: task.id, statusId: todo.id });
  await statusesService.delete(ctx, qa.id);
  history = await listFor(task.id);
});
afterAll(closeDb);

describe("activityService.listEntityHistory", () => {
  it("returns an item's events newest first with the created event last", () => {
    expect(history.at(-1)!.action).toBe("created");
    for (let i = 1; i < history.length; i++) {
      expect(history[i - 1]!.occurredAt >= history[i]!.occurredAt).toBe(true);
    }
    expect(history[0]!.field).toBe("statusId");
    expect(history[0]!.newLabel).toBe("Todo");
  });

  it("puts created last when an edit shares its exact occurredAt", async () => {
    const t = await tasksService.create(ctx, { projectId, title: "Same tick", priority: "none" });
    const at = new Date("2000-01-01T00:00:00.000Z");
    const base = {
      projectId,
      actorId: ctx.userId,
      entityType: "task" as const,
      entityId: t.id,
      entityLabel: "Same tick",
    };
    // Several rows with identical timestamps so random UUID order alone would eventually misplace `created`.
    await ctx.db.insert(activityEvents).values([
      { ...base, action: "updated", field: "title", oldValue: "a", newValue: "b", occurredAt: at },
      { ...base, action: "created", occurredAt: at },
      { ...base, action: "updated", field: "priority", oldValue: "none", newValue: "high", occurredAt: at },
      { ...base, action: "updated", field: "description", oldValue: null, newValue: "x", occurredAt: at },
    ]);
    const c = await commentsService.create(ctx, { projectId, entityType: "task", entityId: t.id, body: "same tick" });
    await ctx.db.update(activityEvents).set({ occurredAt: at }).where(eq(activityEvents.entityId, c.id));

    const h = await listFor(t.id);
    const tied = h.filter((x) => x.occurredAt === at.toISOString());
    expect(tied).toHaveLength(5);
    expect(tied.at(-1)!.action).toBe("created");
    expect(tied.at(-1)!.entityType).toBe("task");
    expect(tied.map((x) => (x.entityType === "comment" ? "comment" : x.action))).toEqual([
      "updated",
      "updated",
      "updated",
      "comment",
      "created",
    ]);
    // The backdated group is the oldest, so its `created` row is the bottom-most row overall.
    expect(h.at(-1)!.action).toBe("created");
  });

  it("records a multi-field save as rows sharing one occurredAt", () => {
    const due = history.find((h) => h.field === "dueDate")!;
    const sameSave = history.filter((h) => h.occurredAt === due.occurredAt).map((h) => h.field);
    expect(sameSave.sort()).toEqual(["assigneeId", "dueDate", "statusId"]);
  });

  it("enriches reference fields with current names", async () => {
    const owner = history.find((h) => h.field === "assigneeId")!;
    expect(owner).toMatchObject({ fieldLabel: "Owner", oldLabel: "empty", newLabel: "Priya Nair" });

    const t = await tasksService.create(ctx, { projectId, title: "Refs", priority: "none" });
    await tasksService.update(ctx, { id: t.id, teamId: team.id, milestoneId: ms.id, labelIds: [label.id] });
    const h = await listFor(t.id);
    expect(h.find((x) => x.field === "teamId")).toMatchObject({ fieldLabel: "Team", newLabel: "Team B" });
    expect(h.find((x) => x.field === "milestoneId")).toMatchObject({
      fieldLabel: "Milestone",
      newLabel: "UAT begins",
    });
    expect(h.find((x) => x.field === "labelIds")).toMatchObject({ fieldLabel: "Labels", newLabel: "backend" });
  });

  it("formats dates and enums for display", async () => {
    const due = history.find((h) => h.field === "dueDate")!;
    expect(due).toMatchObject({ fieldLabel: "Due date", oldLabel: "18 Sep 2026", newLabel: "23 Sep 2026" });

    const t = await tasksService.create(ctx, { projectId, title: "Enums", priority: "none" });
    await tasksService.update(ctx, { id: t.id, priority: "high" });
    const h = await listFor(t.id);
    expect(h.find((x) => x.field === "priority")).toMatchObject({
      fieldLabel: "Priority",
      oldLabel: "None",
      newLabel: "High",
    });
  });

  it("renders a deleted Status with a (deleted) fallback", () => {
    const statusRows = history.filter((h) => h.field === "statusId");
    expect(statusRows).toHaveLength(2);
    const [second, first] = statusRows;
    expect(first!.newLabel).toBe(`${qa.id} (deleted)`);
    expect(second!.oldLabel).toBe(`${qa.id} (deleted)`);
  });

  it("excludes events for a different item in the same project", async () => {
    const other = await tasksService.create(ctx, { projectId, title: "Other", priority: "none" });
    await tasksService.update(ctx, { id: other.id, title: "Other renamed" });
    const otherIds = new Set((await activityRepo.forEntity(ctx.db, other.id)).map((r) => r.event.id));
    expect(otherIds.size).toBeGreaterThan(0);
    const mine = await listFor(task.id);
    expect(mine.some((h) => otherIds.has(h.id))).toBe(false);
  });

  it("includes comment posts and deletions for the item with their body", async () => {
    const other = await tasksService.create(ctx, { projectId, title: "Commented elsewhere", priority: "none" });
    await commentsService.create(ctx, { projectId, entityType: "task", entityId: other.id, body: "Not mine" });
    const c = await commentsService.create(ctx, {
      projectId,
      entityType: "task",
      entityId: task.id,
      body: "Jason said Monday",
    });
    await commentsService.delete(ctx, c.id);

    const h = await listFor(task.id);
    const comments = h.filter((x) => x.entityType === "comment");
    expect(comments).toHaveLength(2);
    expect(comments.find((x) => x.action === "created")).toMatchObject({
      kind: "comment",
      fieldLabel: "Comment",
      newLabel: "Jason said Monday",
    });
    expect(comments.find((x) => x.action === "deleted")).toMatchObject({
      kind: "comment",
      oldLabel: "Jason said Monday",
    });
    expect(h.some((x) => x.newLabel === "Not mine" || x.oldLabel === "Not mine")).toBe(false);
  });

  it("rejects a foreign User", async () => {
    const stranger = await makeCtx();
    await expect(
      activityService.listEntityHistory(stranger, { projectId, entityType: "task", entityId: task.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns an empty list for an unknown item in an owned project", async () => {
    expect(await listFor(randomUUID())).toEqual([]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError, ValidationError } from "@/server/core/errors";
import { eventBus, type DomainEvent } from "@/server/events/bus";
import { activityRepo } from "@/server/modules/activity/service";
import { statusesService } from "@/server/modules/statuses/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { tasksService } from "./service";

let ctx: Ctx;
let projectId: string;

beforeAll(async () => {
  ctx = await makeCtx();
  projectId = (await makeProject(ctx)).id;
});
afterAll(closeDb);

describe("tasksService", () => {
  it("assigns sequential numbers and the project's default status", async () => {
    const a = await tasksService.create(ctx, { projectId, title: "First", priority: "none" });
    const b = await tasksService.create(ctx, { projectId, title: "Second", priority: "none" });
    expect(a.number).toBe(1);
    expect(b.number).toBe(2);
    const def = (await statusesService.list(ctx, projectId, "task")).find((s) => s.isDefault)!;
    expect(a.statusId).toBe(def.id);
    expect(a.completedAt).toBeNull();
  });

  it("records one Activity Event per changed field and publishes a domain event", async () => {
    const task = await tasksService.create(ctx, { projectId, title: "Slips", priority: "none", dueDate: "2026-09-18" });
    const received: DomainEvent[] = [];
    const unsub = eventBus.subscribe("task.updated", (e) => void received.push(e));

    await tasksService.update(ctx, { id: task.id, dueDate: "2026-09-23", priority: "high", title: "Slips" });
    unsub();

    const history = await activityRepo.forEntity(ctx.db, task.id);
    const updates = history.filter((h) => h.event.action === "updated").map((h) => h.event);
    expect(updates.map((u) => u.field).sort()).toEqual(["dueDate", "priority"]);
    expect(updates.find((u) => u.field === "dueDate")).toMatchObject({
      oldValue: "2026-09-18",
      newValue: "2026-09-23",
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.changes.map((c) => c.field).sort()).toEqual(["dueDate", "priority"]);
  });

  it("stamps via on the Activity Event and the domain event when the Ctx carries it", async () => {
    const task = await tasksService.create(ctx, { projectId, title: "Planned by hand", priority: "none" });
    const received: DomainEvent[] = [];
    const unsub = eventBus.subscribe("task.updated", (e) => void received.push(e));

    await tasksService.update({ ...ctx, via: "assistant" }, { id: task.id, title: "Planned by the Assistant" });
    unsub();

    const history = await activityRepo.forEntity(ctx.db, task.id);
    expect(history.find((h) => h.event.action === "updated")?.event.via).toBe("assistant");
    expect(history.find((h) => h.event.action === "created")?.event.via).toBeNull();
    expect(received[0]?.via).toBe("assistant");
  });

  it("sets completedAt when moved to a 'done' status and clears it when moved back", async () => {
    const statuses = await statusesService.list(ctx, projectId, "task");
    const done = statuses.find((s) => s.category === "done")!;
    const todo = statuses.find((s) => s.isDefault)!;
    const task = await tasksService.create(ctx, { projectId, title: "Finish me", priority: "none" });

    const finished = await tasksService.update(ctx, { id: task.id, statusId: done.id });
    expect(finished.completedAt).toBeInstanceOf(Date);

    const reopened = await tasksService.update(ctx, { id: task.id, statusId: todo.id });
    expect(reopened.completedAt).toBeNull();
  });

  it("rejects a due date before the start date", async () => {
    await expect(
      tasksService.create(ctx, {
        projectId,
        title: "Bad dates",
        priority: "none",
        startDate: "2026-09-20",
        dueDate: "2026-09-10",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a status from another project", async () => {
    const other = await makeProject(ctx, "OTH");
    const foreign = (await statusesService.list(ctx, other.id, "task"))[0]!;
    await expect(
      tasksService.create(ctx, { projectId, title: "x", priority: "none", statusId: foreign.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses access to another user's project", async () => {
    const stranger = await makeCtx();
    await expect(tasksService.list(stranger, projectId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a start date be cleared while the due date moves before it", async () => {
    const task = await tasksService.create(ctx, {
      projectId,
      title: "Reschedule",
      priority: "none",
      startDate: "2026-09-10",
      dueDate: "2026-09-20",
    });
    const after = await tasksService.update(ctx, { id: task.id, startDate: null, dueDate: "2026-09-05" });
    expect(after.startDate).toBeNull();
    expect(after.dueDate).toBe("2026-09-05");
  });

  it("still commits when a subscriber throws synchronously", async () => {
    const unsub = eventBus.subscribe("task.created", () => {
      throw new Error("boom");
    });
    try {
      const task = await tasksService.create(ctx, { projectId, title: "Resilient", priority: "none" });
      expect(task.id).toBeTruthy();
    } finally {
      unsub();
    }
  });
});

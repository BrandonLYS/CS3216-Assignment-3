import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ConflictError, ValidationError } from "@/server/core/errors";
import { milestonesService } from "@/server/modules/milestones/service";
import { tasksService } from "@/server/modules/tasks/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { dependenciesService } from "./service";

let ctx: Ctx;
let projectId: string;

beforeAll(async () => {
  ctx = await makeCtx();
  projectId = (await makeProject(ctx)).id;
});
afterAll(closeDb);

describe("dependenciesService", () => {
  it("links tasks and milestones, rejects duplicates and cycles", async () => {
    const api = await tasksService.create(ctx, { projectId, title: "API", priority: "none" });
    const integ = await tasksService.create(ctx, { projectId, title: "Integration", priority: "none" });
    const uat = await milestonesService.create(ctx, { projectId, name: "UAT", dueDate: "2026-10-01" });

    await dependenciesService.create(ctx, {
      projectId,
      predecessorType: "task",
      predecessorId: api.id,
      successorType: "task",
      successorId: integ.id,
    });
    await dependenciesService.create(ctx, {
      projectId,
      predecessorType: "task",
      predecessorId: integ.id,
      successorType: "milestone",
      successorId: uat.id,
    });

    await expect(
      dependenciesService.create(ctx, {
        projectId,
        predecessorType: "task",
        predecessorId: api.id,
        successorType: "task",
        successorId: integ.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      dependenciesService.create(ctx, {
        projectId,
        predecessorType: "milestone",
        predecessorId: uat.id,
        successorType: "task",
        successorId: api.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects endpoints from another project", async () => {
    const other = await makeProject(ctx, "OTH");
    const foreign = await tasksService.create(ctx, { projectId: other.id, title: "foreign", priority: "none" });
    const local = await tasksService.create(ctx, { projectId, title: "local", priority: "none" });
    await expect(
      dependenciesService.create(ctx, {
        projectId,
        predecessorType: "task",
        predecessorId: foreign.id,
        successorType: "task",
        successorId: local.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("removes edges when an endpoint is deleted", async () => {
    const a = await tasksService.create(ctx, { projectId, title: "a", priority: "none" });
    const b = await tasksService.create(ctx, { projectId, title: "b", priority: "none" });
    await dependenciesService.create(ctx, {
      projectId,
      predecessorType: "task",
      predecessorId: a.id,
      successorType: "task",
      successorId: b.id,
    });
    await tasksService.delete(ctx, a.id);
    const remaining = await dependenciesService.list(ctx, projectId);
    expect(remaining.some((d) => d.predecessorId === a.id)).toBe(false);
  });
});

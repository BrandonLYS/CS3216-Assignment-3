import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError } from "@/server/core/errors";
import { eventBus, type DomainEvent } from "@/server/events/bus";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { projectsRepo } from "./repository";
import { projectsService } from "./service";

let ctx: Ctx;

beforeAll(async () => {
  ctx = await makeCtx();
});
afterAll(closeDb);

describe("projectsService", () => {
  it("deletes a project and leaves nothing behind", async () => {
    const project = await makeProject(ctx, "DEL");

    await expect(projectsService.delete(ctx, project.id)).resolves.toBeUndefined();

    expect(await projectsRepo.findByIdForOwner(ctx.db, project.id, ctx.userId)).toBeUndefined();
    await expect(projectsService.get(ctx, project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("publishes project.deleted on the event bus", async () => {
    const project = await makeProject(ctx, "EVT");
    const received: DomainEvent[] = [];
    const unsub = eventBus.subscribe("project.deleted", (e) => void received.push(e));

    await projectsService.delete(ctx, project.id);
    unsub();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      name: "project.deleted",
      action: "deleted",
      projectId: project.id,
      entityId: project.id,
      entityLabel: project.name,
    });
  });
});

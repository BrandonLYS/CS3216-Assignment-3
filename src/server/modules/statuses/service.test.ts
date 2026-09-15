import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ConflictError, ValidationError } from "@/server/core/errors";
import { tasksService } from "@/server/modules/tasks/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { DEFAULT_STATUSES } from "./defaults";
import { statusesService } from "./service";

let ctx: Ctx;
let projectId: string;

beforeAll(async () => {
  ctx = await makeCtx();
  projectId = (await makeProject(ctx)).id;
});
afterAll(closeDb);

describe("statusesService", () => {
  it("seeds the default status set with exactly one default per scope", async () => {
    const all = await statusesService.list(ctx, projectId);
    expect(all).toHaveLength(DEFAULT_STATUSES.length);
    for (const scope of ["task", "milestone", "risk"] as const) {
      expect(all.filter((s) => s.scope === scope && s.isDefault)).toHaveLength(1);
    }
  });

  it("lets users add a custom status but only with a category valid for the scope", async () => {
    const qa = await statusesService.create(ctx, {
      projectId,
      scope: "task",
      category: "in_progress",
      name: "In QA",
      color: "#a68af7",
    });
    expect(qa.category).toBe("in_progress");
    await expect(
      statusesService.create(ctx, { projectId, scope: "task", category: "at_risk", name: "Nope", color: "#ffffff" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to delete a status that is in use or is the default", async () => {
    const statuses = await statusesService.list(ctx, projectId, "task");
    const def = statuses.find((s) => s.isDefault)!;
    const blocked = statuses.find((s) => s.category === "blocked")!;
    await tasksService.create(ctx, { projectId, title: "uses blocked", priority: "none", statusId: blocked.id });

    await expect(statusesService.delete(ctx, def.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(statusesService.delete(ctx, blocked.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("moves the default flag when another status becomes default", async () => {
    const statuses = await statusesService.list(ctx, projectId, "task");
    const backlog = statuses.find((s) => s.name === "Backlog")!;
    await statusesService.update(ctx, { id: backlog.id, isDefault: true });
    const after = await statusesService.list(ctx, projectId, "task");
    expect(after.filter((s) => s.isDefault).map((s) => s.name)).toEqual(["Backlog"]);
  });

  it("keeps exactly one default when the current default is re-affirmed", async () => {
    const statuses = await statusesService.list(ctx, projectId, "task");
    const def = statuses.find((s) => s.isDefault)!;
    await statusesService.update(ctx, { id: def.id, isDefault: true });
    const after = await statusesService.list(ctx, projectId, "task");
    expect(after.filter((s) => s.isDefault).map((s) => s.id)).toEqual([def.id]);
  });

  it("refuses to reorder statuses that belong to another user's project", async () => {
    const mallory = await makeCtx();
    const malloryProject = (await makeProject(mallory, "MAL")).id;
    const [target] = await statusesService.list(ctx, projectId, "task");

    await expect(statusesService.reorder(mallory, malloryProject, [target!.id])).rejects.toBeInstanceOf(
      ValidationError,
    );
    const after = await statusesService.list(ctx, projectId, "task");
    expect(after.find((s) => s.id === target!.id)!.sortOrder).toBe(target!.sortOrder);
  });
});

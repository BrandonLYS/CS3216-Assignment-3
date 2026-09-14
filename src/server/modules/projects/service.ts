import type { Ctx } from "@/server/core/context";
import { compactPatch, diffFields } from "@/server/core/diff";
import { ForbiddenError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import type { DbOrTx } from "@/server/db/client";
import { statusesService } from "@/server/modules/statuses/service";
import { projectsRepo } from "./repository";
import type { ProjectRow } from "./schema";
import type { CreateProjectInput, UpdateProjectInput } from "./validation";

/**
 * Central authorization check (ADR 0002). Every module that touches project-scoped
 * data calls this first; it is the single seam for future sharing/permissions.
 */
export async function assertOwnsProject(db: DbOrTx, userId: string, projectId: string): Promise<ProjectRow> {
  const project = await projectsRepo.findByIdForOwner(db, projectId, userId);
  if (!project) throw new ForbiddenError("Project not found or not yours");
  return project;
}

export const projectsService = {
  list: (ctx: Ctx) => projectsRepo.listByOwner(ctx.db, ctx.userId),

  get: (ctx: Ctx, id: string) => assertOwnsProject(ctx.db, ctx.userId, id),

  create: (ctx: Ctx, input: CreateProjectInput) =>
    mutate(ctx, async (tx, rec) => {
      const project = await projectsRepo.insert(tx, { ...input, ownerId: ctx.userId });
      await statusesService.seedDefaults(tx, project.id);
      rec.created("project", project.id, project.id, project.name);
      return project;
    }),

  update: (ctx: Ctx, { id, ...patch }: UpdateProjectInput) =>
    mutate(ctx, async (tx, rec) => {
      const before = await assertOwnsProject(tx, ctx.userId, id);
      const clean = compactPatch(patch);
      const changes = diffFields(before, clean);
      if (!changes.length) return before;
      const after = await projectsRepo.update(tx, id, clean);
      rec.updated("project", id, id, after.name, changes);
      return after;
    }),

  /**
   * The project's Activity Events cascade away with it, so `rec.deleted` cannot persist a row;
   * it still publishes `project.deleted` so subscribers can react.
   */
  delete: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const project = await assertOwnsProject(tx, ctx.userId, id);
      await projectsRepo.delete(tx, id);
      rec.deleted("project", id, id, project.name);
    }),
};

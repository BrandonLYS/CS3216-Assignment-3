import { z } from "zod";
import type { Ctx } from "@/server/core/context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import { optionalText } from "@/server/core/validation";
import type { DbOrTx } from "@/server/db/client";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { tasksRepo } from "@/server/modules/tasks/repository";
import { DEPENDENCY_ITEM_TYPES, type DependencyItemType } from "@/shared/domain";
import { wouldCreateCycle } from "./graph";
import { dependenciesRepo } from "./repository";

export const createDependencySchema = z.object({
  projectId: z.string(),
  predecessorType: z.enum(DEPENDENCY_ITEM_TYPES),
  predecessorId: z.string(),
  successorType: z.enum(DEPENDENCY_ITEM_TYPES),
  successorId: z.string(),
  note: optionalText,
});
export type CreateDependencyInput = z.infer<typeof createDependencySchema>;

async function itemLabel(db: DbOrTx, projectId: string, type: DependencyItemType, id: string): Promise<string> {
  if (type === "task") {
    const t = await tasksRepo.findById(db, id);
    if (!t || t.projectId !== projectId) throw new ValidationError("Task not in this project");
    return t.title;
  }
  const m = await milestonesRepo.findById(db, id);
  if (!m || m.projectId !== projectId) throw new ValidationError("Milestone not in this project");
  return m.name;
}

export const dependenciesService = {
  list: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return dependenciesRepo.listByProject(ctx.db, projectId);
  },

  create: (ctx: Ctx, input: CreateDependencyInput) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      const [predLabel, succLabel] = await Promise.all([
        itemLabel(tx, input.projectId, input.predecessorType, input.predecessorId),
        itemLabel(tx, input.projectId, input.successorType, input.successorId),
      ]);
      const edges = await dependenciesRepo.listByProject(tx, input.projectId);
      if (edges.some((e) => e.predecessorId === input.predecessorId && e.successorId === input.successorId)) {
        throw new ConflictError("That dependency already exists");
      }
      if (wouldCreateCycle(edges, input.predecessorId, input.successorId)) {
        throw new ConflictError(`"${succLabel}" already comes before "${predLabel}" — that would be a cycle`);
      }
      const dep = await dependenciesRepo.insert(tx, input);
      rec.created("dependency", input.projectId, dep.id, `${predLabel} → ${succLabel}`);
      return dep;
    }),

  delete: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const dep = await dependenciesRepo.findById(tx, id);
      if (!dep) throw new NotFoundError("Dependency");
      await assertOwnsProject(tx, ctx.userId, dep.projectId);
      await dependenciesRepo.delete(tx, id);
      rec.deleted("dependency", dep.projectId, id, `${dep.predecessorId} → ${dep.successorId}`);
    }),
};

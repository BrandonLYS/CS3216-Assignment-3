import type { Ctx } from "@/server/core/context";
import { compactPatch, diffFields } from "@/server/core/diff";
import { ConflictError, NotFoundError, ValidationError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import type { DbOrTx } from "@/server/db/client";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { CATEGORIES_BY_SCOPE, type StatusScope } from "@/shared/domain";
import { DEFAULT_STATUSES } from "./defaults";
import { statusesRepo } from "./repository";
import type { StatusRow } from "./schema";
import type { CreateStatusInput, UpdateStatusInput } from "./validation";

function assertCategoryFitsScope(scope: StatusScope, category: string) {
  if (!(CATEGORIES_BY_SCOPE[scope] as readonly string[]).includes(category)) {
    throw new ValidationError(`Category "${category}" is not valid for ${scope} statuses`, {
      category: ["Not valid for this scope"],
    });
  }
}

async function getOwned(db: DbOrTx, userId: string, id: string): Promise<StatusRow> {
  const status = await statusesRepo.findById(db, id);
  if (!status) throw new NotFoundError("Status");
  await assertOwnsProject(db, userId, status.projectId);
  return status;
}

export const statusesService = {
  /** Called inside project creation. */
  seedDefaults: (db: DbOrTx, projectId: string) =>
    statusesRepo.insertMany(
      db,
      DEFAULT_STATUSES.map((s, i) => ({ ...s, projectId, sortOrder: i, isDefault: s.isDefault ?? false })),
    ),

  list: async (ctx: Ctx, projectId: string, scope?: StatusScope) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return statusesRepo.listByProject(ctx.db, projectId, scope);
  },

  /** Resolve the status for a new item: explicit id (validated) or the project default. */
  resolveForNewItem: async (db: DbOrTx, projectId: string, scope: StatusScope, statusId?: string | null) => {
    if (statusId) {
      const s = await statusesRepo.findById(db, statusId);
      if (!s || s.projectId !== projectId || s.scope !== scope) throw new ValidationError("Invalid status");
      return s;
    }
    const def = await statusesRepo.findDefault(db, projectId, scope);
    if (!def) throw new ConflictError(`Project has no default ${scope} status`);
    return def;
  },

  /** Validate a status change target belongs to the same project & scope. */
  assertValidTarget: async (db: DbOrTx, projectId: string, scope: StatusScope, statusId: string) => {
    const s = await statusesRepo.findById(db, statusId);
    if (!s || s.projectId !== projectId || s.scope !== scope) throw new ValidationError("Invalid status");
    return s;
  },

  create: (ctx: Ctx, input: CreateStatusInput) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      assertCategoryFitsScope(input.scope, input.category);
      const existing = await statusesRepo.listByProject(tx, input.projectId, input.scope);
      const [status] = await statusesRepo.insertMany(tx, [{ ...input, sortOrder: existing.length }]);
      rec.created("status", input.projectId, status!.id, status!.name);
      return status!;
    }),

  update: (ctx: Ctx, { id, ...patch }: UpdateStatusInput) =>
    mutate(ctx, async (tx, rec) => {
      const before = await getOwned(tx, ctx.userId, id);
      const clean = compactPatch(patch);
      if (clean.category) assertCategoryFitsScope(before.scope, clean.category);
      if (clean.isDefault === false && before.isDefault) {
        throw new ValidationError("Pick another status as default instead of unsetting this one");
      }
      const changes = diffFields(before, clean);
      if (!changes.length) return before;
      if (clean.isDefault) {
        const previous = await statusesRepo.findDefault(tx, before.projectId, before.scope);
        await statusesRepo.clearDefault(tx, before.projectId, before.scope);
        if (previous && previous.id !== id) {
          rec.updated("status", before.projectId, previous.id, previous.name, [
            { field: "isDefault", oldValue: true, newValue: false },
          ]);
        }
      }
      const after = await statusesRepo.update(tx, id, clean);
      rec.updated("status", before.projectId, id, after.name, changes);
      return after;
    }),

  reorder: (ctx: Ctx, projectId: string, ids: string[]) =>
    mutate(ctx, async (tx) => {
      await assertOwnsProject(tx, ctx.userId, projectId);
      const owned = new Set((await statusesRepo.listByProject(tx, projectId)).map((s) => s.id));
      if (ids.some((id) => !owned.has(id))) throw new ValidationError("Invalid status");
      await Promise.all(ids.map((id, i) => statusesRepo.update(tx, id, { sortOrder: i })));
    }),

  delete: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const status = await getOwned(tx, ctx.userId, id);
      if (status.isDefault) throw new ConflictError("Make another status the default before deleting this one");
      const used = await statusesRepo.usageCount(tx, status);
      if (used > 0) throw new ConflictError(`${used} item(s) still use this status. Reassign them first.`);
      await statusesRepo.delete(tx, id);
      rec.deleted("status", status.projectId, id, status.name);
    }),
};

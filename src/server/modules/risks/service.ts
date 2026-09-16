import type { Ctx } from "@/server/core/context";
import { compactPatch, diffFields } from "@/server/core/diff";
import { NotFoundError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import { nextNumber } from "@/server/core/sequence";
import type { DbOrTx } from "@/server/db/client";
import { commentsRepo } from "@/server/modules/comments/repository";
import { assertPersonInProject } from "@/server/modules/people/service";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { statusesService } from "@/server/modules/statuses/service";
import { risksRepo } from "./repository";
import { risks, type RiskRow } from "./schema";
import type { CreateRiskInput, UpdateRiskInput } from "./validation";

async function getOwned(db: DbOrTx, userId: string, id: string): Promise<RiskRow> {
  const r = await risksRepo.findById(db, id);
  if (!r) throw new NotFoundError("Risk");
  await assertOwnsProject(db, userId, r.projectId);
  return r;
}

export const risksService = {
  list: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return risksRepo.listByProject(ctx.db, projectId);
  },

  get: (ctx: Ctx, id: string) => getOwned(ctx.db, ctx.userId, id),

  create: (ctx: Ctx, input: CreateRiskInput) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      await assertPersonInProject(tx, input.projectId, input.ownerId);
      const status = await statusesService.resolveForNewItem(tx, input.projectId, "risk", input.statusId);
      const number = await nextNumber(tx, input.projectId, risks, risks.number, risks.projectId);
      const risk = await risksRepo.insert(tx, { ...input, statusId: status.id, number });
      rec.created("risk", input.projectId, risk.id, risk.title);
      return risk;
    }),

  update: (ctx: Ctx, { id, ...patch }: UpdateRiskInput) =>
    mutate(ctx, async (tx, rec) => {
      const before = await getOwned(tx, ctx.userId, id);
      const clean = compactPatch(patch);
      await assertPersonInProject(tx, before.projectId, clean.ownerId);
      if (clean.statusId) await statusesService.assertValidTarget(tx, before.projectId, "risk", clean.statusId);
      const changes = diffFields(before, clean);
      if (!changes.length) return before;
      const after = await risksRepo.update(tx, id, clean);
      rec.updated("risk", before.projectId, id, after.title, changes);
      return after;
    }),

  delete: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const r = await getOwned(tx, ctx.userId, id);
      await commentsRepo.deleteForEntity(tx, "risk", id);
      await risksRepo.delete(tx, id);
      rec.deleted("risk", r.projectId, id, r.title);
    }),
};

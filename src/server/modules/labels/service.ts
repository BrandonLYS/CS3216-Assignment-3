import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "@/server/core/context";
import { compactPatch, diffFields } from "@/server/core/diff";
import { NotFoundError, ValidationError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import { hexColor, requiredText } from "@/server/core/validation";
import type { DbOrTx } from "@/server/db/client";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { labels, type LabelRow } from "./schema";

export const createLabelSchema = z.object({
  projectId: z.string(),
  name: requiredText("Name", 40),
  color: hexColor,
});
export const updateLabelSchema = z.object({
  id: z.string(),
  name: requiredText("Name", 40).optional(),
  color: hexColor.optional(),
});

export const labelsRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    db.select().from(labels).where(eq(labels.projectId, projectId)).orderBy(asc(labels.name)),
  findById: async (db: DbOrTx, id: string): Promise<LabelRow | undefined> => {
    const [row] = await db.select().from(labels).where(eq(labels.id, id));
    return row;
  },
  findByIds: (db: DbOrTx, ids: string[]) =>
    ids.length ? db.select().from(labels).where(inArray(labels.id, ids)) : Promise.resolve([] as LabelRow[]),
};

export async function assertLabelsInProject(db: DbOrTx, projectId: string, ids: string[]) {
  const rows = await labelsRepo.findByIds(db, ids);
  if (rows.length !== ids.length || rows.some((l) => l.projectId !== projectId)) {
    throw new ValidationError("Invalid label", { labelIds: ["Invalid"] });
  }
}

export const labelsService = {
  list: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return labelsRepo.listByProject(ctx.db, projectId);
  },

  create: (ctx: Ctx, input: z.infer<typeof createLabelSchema>) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      const [label] = await tx.insert(labels).values(input).returning();
      rec.created("label", input.projectId, label!.id, label!.name);
      return label!;
    }),

  update: (ctx: Ctx, { id, ...patch }: z.infer<typeof updateLabelSchema>) =>
    mutate(ctx, async (tx, rec) => {
      const before = await labelsRepo.findById(tx, id);
      if (!before) throw new NotFoundError("Label");
      await assertOwnsProject(tx, ctx.userId, before.projectId);
      const clean = compactPatch(patch);
      const changes = diffFields(before, clean);
      if (!changes.length) return before;
      const [after] = await tx.update(labels).set(clean).where(eq(labels.id, id)).returning();
      rec.updated("label", before.projectId, id, after!.name, changes);
      return after!;
    }),

  delete: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const label = await labelsRepo.findById(tx, id);
      if (!label) throw new NotFoundError("Label");
      await assertOwnsProject(tx, ctx.userId, label.projectId);
      await tx.delete(labels).where(eq(labels.id, id));
      rec.deleted("label", label.projectId, id, label.name);
    }),
};

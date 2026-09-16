import type { Ctx } from "@/server/core/context";
import { NotFoundError, ValidationError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import type { DbOrTx } from "@/server/db/client";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { peopleRepo } from "@/server/modules/people/repository";
import { assertPersonInProject } from "@/server/modules/people/service";
import type { ProjectRow } from "@/server/modules/projects/schema";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { risksRepo } from "@/server/modules/risks/repository";
import { tasksRepo } from "@/server/modules/tasks/repository";
import { COMMENT_MAX_LENGTH, labelFor, type CommentableEntityType } from "@/shared/domain";
import { commentsRepo } from "./repository";
import type { CommentRow } from "./schema";
import type { CreateCommentInput, ListCommentsInput } from "./validation";

/**
 * Payload stored in the Activity Event (`newValue` on created, `oldValue` on deleted).
 * Carries the parent item reference so a History view can select Comment events per
 * item with a jsonb containment query even after the Comment row is gone.
 */
export type CommentSnapshot = {
  entityType: CommentableEntityType;
  entityId: string;
  body: string;
  saidById: string | null;
  saidByName: string | null;
  saidOn: string | null;
};

export const COMMENT_LABEL_MAX = 60;

/** "ACME-12: first line of the body…" — used as entityLabel for Activity Events. */
export function commentLabel(itemLabel: string, body: string): string {
  const firstLine = body.split(/\r?\n/, 1)[0]!.trim();
  const excerpt =
    firstLine.length > COMMENT_LABEL_MAX ? `${firstLine.slice(0, COMMENT_LABEL_MAX - 1).trimEnd()}…` : firstLine;
  return `${itemLabel}: ${excerpt}`;
}

const snapshotOf = (c: CommentRow): CommentSnapshot => ({
  entityType: c.entityType as CommentableEntityType,
  entityId: c.entityId,
  body: c.body,
  saidById: c.saidById,
  saidByName: c.saidByName,
  saidOn: c.saidOn,
});

/** Resolve the commented item; ValidationError if it is missing or in another Project. */
async function resolveItem(
  db: DbOrTx,
  project: ProjectRow,
  entityType: CommentableEntityType,
  entityId: string,
): Promise<{ label: string }> {
  const notFound = () => new ValidationError("Item not found in this project", { entityId: ["Invalid"] });
  switch (entityType) {
    case "task": {
      const t = await tasksRepo.findById(db, entityId);
      if (!t || t.projectId !== project.id) throw notFound();
      return { label: `${project.key}-${t.number}` };
    }
    case "risk": {
      const r = await risksRepo.findById(db, entityId);
      if (!r || r.projectId !== project.id) throw notFound();
      return { label: `R-${r.number}` };
    }
    case "milestone": {
      const m = await milestonesRepo.findById(db, entityId);
      if (!m || m.projectId !== project.id) throw notFound();
      return { label: m.name };
    }
  }
}

async function getOwned(db: DbOrTx, userId: string, id: string): Promise<CommentRow> {
  const c = await commentsRepo.findById(db, id);
  if (!c) throw new NotFoundError("Comment");
  await assertOwnsProject(db, userId, c.projectId);
  return c;
}

export const commentsService = {
  listForEntity: async (ctx: Ctx, { projectId, entityType, entityId }: ListCommentsInput) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return commentsRepo.listForEntity(ctx.db, projectId, entityType, entityId);
  },

  create: (ctx: Ctx, input: CreateCommentInput) =>
    mutate(ctx, async (tx, rec) => {
      const project = await assertOwnsProject(tx, ctx.userId, input.projectId);
      // Re-validated here (not only in zod) so callers of the service get the same guarantees.
      const body = input.body.trim();
      if (!body) throw new ValidationError("Comment is required", { body: ["Required"] });
      if (body.length > COMMENT_MAX_LENGTH) {
        throw new ValidationError("Comment is too long (max 4,000 characters)", { body: ["Too long"] });
      }
      const { label } = await resolveItem(tx, project, input.entityType, input.entityId);
      await assertPersonInProject(tx, project.id, input.saidById, "saidById");
      const saidByName = input.saidById ? (await peopleRepo.findById(tx, input.saidById))!.name : null;
      const row = await commentsRepo.insert(tx, {
        projectId: project.id,
        entityType: input.entityType,
        entityId: input.entityId,
        body,
        saidById: input.saidById ?? null,
        saidByName,
        saidOn: input.saidOn ?? null,
        authorId: ctx.userId,
      });
      rec.created("comment", project.id, row.id, commentLabel(label, body), snapshotOf(row));
      return row;
    }),

  delete: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const c = await getOwned(tx, ctx.userId, id);
      const project = await assertOwnsProject(tx, ctx.userId, c.projectId);
      const label = await resolveItem(tx, project, c.entityType as CommentableEntityType, c.entityId)
        .then((r) => r.label)
        .catch(() => labelFor(c.entityType));
      await commentsRepo.delete(tx, id);
      rec.deleted("comment", c.projectId, id, commentLabel(label, c.body), snapshotOf(c));
      return c;
    }),
};

import { and, asc, eq, inArray } from "drizzle-orm";
import { user } from "@/server/auth/schema";
import type { DbOrTx } from "@/server/db/client";
import { people } from "@/server/modules/people/schema";
import type { CommentableEntityType } from "@/shared/domain";
import { comments, type CommentRow, type NewCommentRow } from "./schema";

export const commentsRepo = {
  /** Oldest first: the story of the item read top to bottom. */
  listForEntity: (db: DbOrTx, projectId: string, entityType: CommentableEntityType, entityId: string) =>
    db
      .select({ comment: comments, saidBy: { id: people.id, name: people.name }, authorName: user.name })
      .from(comments)
      .leftJoin(people, eq(people.id, comments.saidById))
      .leftJoin(user, eq(user.id, comments.authorId))
      .where(
        and(eq(comments.projectId, projectId), eq(comments.entityType, entityType), eq(comments.entityId, entityId)),
      )
      .orderBy(asc(comments.createdAt), asc(comments.id)),

  /** Every Comment in a Project, oldest first (the Proposal pass reads them as Sources). */
  listByProject: (db: DbOrTx, projectId: string) =>
    db.select().from(comments).where(eq(comments.projectId, projectId)).orderBy(asc(comments.createdAt)),

  findByIds: (db: DbOrTx, ids: string[]): Promise<CommentRow[]> =>
    ids.length ? db.select().from(comments).where(inArray(comments.id, ids)) : Promise.resolve([]),

  findById: async (db: DbOrTx, id: string): Promise<CommentRow | undefined> => {
    const [row] = await db.select().from(comments).where(eq(comments.id, id));
    return row;
  },

  insert: async (db: DbOrTx, values: NewCommentRow) => {
    const [row] = await db.insert(comments).values(values).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(comments).where(eq(comments.id, id)),

  /** Remove every Comment on an item; called by the item's own service inside its delete transaction. */
  deleteForEntity: (db: DbOrTx, entityType: CommentableEntityType, entityId: string) =>
    db.delete(comments).where(and(eq(comments.entityType, entityType), eq(comments.entityId, entityId))),
};

export type CommentListItem = Awaited<ReturnType<typeof commentsRepo.listForEntity>>[number];

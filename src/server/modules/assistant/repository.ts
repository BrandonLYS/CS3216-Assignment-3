import { and, asc, count, eq, gte, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { conversations, messages, type ConversationRow } from "./schema";

export const conversationsRepo = {
  findOrCreate: async (db: DbOrTx, userId: string, projectId: string | null): Promise<ConversationRow> => {
    const [existing] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          projectId ? eq(conversations.projectId, projectId) : isNull(conversations.projectId),
        ),
      );
    if (existing) return existing;
    const [row] = await db.insert(conversations).values({ userId, projectId }).returning();
    return row!;
  },

  findById: async (db: DbOrTx, id: string): Promise<ConversationRow | undefined> => {
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
    return row;
  },
};

export const messagesRepo = {
  listByConversation: (db: DbOrTx, conversationId: string) =>
    db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt)),

  upsertMany: async (db: DbOrTx, rows: (typeof messages.$inferInsert)[]) => {
    // A thread can carry the same client id twice (a re-sent turn); Postgres refuses to upsert
    // one row twice in a statement, so the last occurrence's parts win here (first position kept).
    const unique = [...new Map(rows.map((r) => [`${r.conversationId}:${r.id}`, r])).values()];
    if (!unique.length) return;
    await db
      .insert(messages)
      .values(unique)
      .onConflictDoUpdate({ target: [messages.conversationId, messages.id], set: { parts: sql`excluded.parts` } });
  },

  /** User Messages this User sent since `since`, across all their Conversations. */
  countUserMessagesSince: async (db: DbOrTx, userId: string, since: Date) => {
    const [row] = await db
      .select({ n: count() })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(conversations.userId, userId), eq(messages.role, "user"), gte(messages.createdAt, since)));
    return row?.n ?? 0;
  },
};

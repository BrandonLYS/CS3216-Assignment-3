import { and, desc, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { conversations } from "@/server/modules/assistant/schema";
import { projects } from "@/server/modules/projects/schema";
import { memoryVersions, type MemoryVersionRow } from "./schema";

const doc = (userId: string, projectId: string | null) =>
  and(
    eq(memoryVersions.userId, userId),
    projectId ? eq(memoryVersions.projectId, projectId) : isNull(memoryVersions.projectId),
  );

export const memoryRepo = {
  /** All versions of one document, newest first, with the Project of the Conversation a Reflection read. */
  versions: async (db: DbOrTx, userId: string, projectId: string | null) => {
    const rows = await db
      .select({ version: memoryVersions, sourceProject: projects.name })
      .from(memoryVersions)
      .leftJoin(conversations, eq(conversations.id, memoryVersions.conversationId))
      .leftJoin(projects, eq(projects.id, conversations.projectId))
      .where(doc(userId, projectId))
      .orderBy(desc(memoryVersions.createdAt), desc(memoryVersions.id));
    return rows.map((r) => ({ ...r.version, sourceProject: r.sourceProject }));
  },

  current: async (db: DbOrTx, userId: string, projectId: string | null): Promise<MemoryVersionRow | undefined> => {
    const [row] = await db
      .select()
      .from(memoryVersions)
      .where(doc(userId, projectId))
      .orderBy(desc(memoryVersions.createdAt), desc(memoryVersions.id))
      .limit(1);
    return row;
  },

  /** The newest Reflection version produced from a Conversation, for throttling. */
  lastReflectionFor: async (db: DbOrTx, conversationId: string): Promise<MemoryVersionRow | undefined> => {
    const [row] = await db
      .select()
      .from(memoryVersions)
      .where(and(eq(memoryVersions.conversationId, conversationId), eq(memoryVersions.author, "reflection")))
      .orderBy(desc(memoryVersions.createdAt), desc(memoryVersions.id))
      .limit(1);
    return row;
  },

  insert: async (db: DbOrTx, values: typeof memoryVersions.$inferInsert) => {
    const [row] = await db.insert(memoryVersions).values(values).returning();
    return row!;
  },
};

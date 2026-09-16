import { and, desc, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { memoryVersions, type MemoryVersionRow } from "./schema";

const doc = (userId: string, projectId: string | null) =>
  and(
    eq(memoryVersions.userId, userId),
    projectId ? eq(memoryVersions.projectId, projectId) : isNull(memoryVersions.projectId),
  );

export const memoryRepo = {
  /** All versions of one document, newest first. */
  versions: (db: DbOrTx, userId: string, projectId: string | null) =>
    db
      .select()
      .from(memoryVersions)
      .where(doc(userId, projectId))
      .orderBy(desc(memoryVersions.createdAt), desc(memoryVersions.id)),

  current: async (db: DbOrTx, userId: string, projectId: string | null): Promise<MemoryVersionRow | undefined> => {
    const [row] = await db
      .select()
      .from(memoryVersions)
      .where(doc(userId, projectId))
      .orderBy(desc(memoryVersions.createdAt), desc(memoryVersions.id))
      .limit(1);
    return row;
  },

  insert: async (db: DbOrTx, values: typeof memoryVersions.$inferInsert) => {
    const [row] = await db.insert(memoryVersions).values(values).returning();
    return row!;
  },
};

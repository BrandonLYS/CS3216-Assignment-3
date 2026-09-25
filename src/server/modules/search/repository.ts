import { asc, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { evidenceChunks, type EvidenceChunkRow } from "./schema";

export const chunksRepo = {
  listForProject: (db: DbOrTx, projectId: string): Promise<EvidenceChunkRow[]> =>
    db
      .select()
      .from(evidenceChunks)
      .where(eq(evidenceChunks.projectId, projectId))
      .orderBy(asc(evidenceChunks.evidenceId), asc(evidenceChunks.ordinal)),

  /** evidenceId -> chunk presence, for the lazy backfill that indexes pre-existing Evidence. */
  indexState: async (
    db: DbOrTx,
    projectId: string,
  ): Promise<Map<string, { chunked: boolean; vectorized: boolean }>> => {
    const rows = await db
      .select({
        evidenceId: evidenceChunks.evidenceId,
        embedded: sql<boolean>`${evidenceChunks.embedding} is not null`,
      })
      .from(evidenceChunks)
      .where(eq(evidenceChunks.projectId, projectId));
    const state = new Map<string, { chunked: boolean; vectorized: boolean }>();
    for (const r of rows) {
      const s = state.get(r.evidenceId) ?? { chunked: false, vectorized: false };
      s.chunked = true;
      s.vectorized ||= r.embedded;
      state.set(r.evidenceId, s);
    }
    return state;
  },

  findByIds: (db: DbOrTx, ids: string[]): Promise<EvidenceChunkRow[]> =>
    ids.length ? db.select().from(evidenceChunks).where(inArray(evidenceChunks.id, ids)) : Promise.resolve([]),

  /** Delete then insert: a projection, so callers lose nothing when text is re-chunked. */
  replaceForEvidence: async (
    db: DbOrTx,
    evidenceId: string,
    projectId: string,
    texts: string[],
    embeddings: number[][] | null,
  ) => {
    await db.delete(evidenceChunks).where(eq(evidenceChunks.evidenceId, evidenceId));
    if (!texts.length) return [];
    return db
      .insert(evidenceChunks)
      .values(
        texts.map((text, ordinal) => ({
          evidenceId,
          projectId,
          ordinal,
          text,
          embedding: embeddings?.[ordinal] ?? null,
        })),
      )
      .returning();
  },
};

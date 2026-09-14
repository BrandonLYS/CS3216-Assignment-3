import { desc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { evidence, type EvidenceRow, type NewEvidenceRow } from "./schema";

export const evidenceRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    db
      .select()
      .from(evidence)
      .where(eq(evidence.projectId, projectId))
      .orderBy(desc(evidence.sourceDate), desc(evidence.createdAt)),

  findById: async (db: DbOrTx, id: string): Promise<EvidenceRow | undefined> => {
    const [row] = await db.select().from(evidence).where(eq(evidence.id, id));
    return row;
  },

  insert: async (db: DbOrTx, values: NewEvidenceRow) => {
    const [row] = await db.insert(evidence).values(values).returning();
    return row!;
  },

  update: async (db: DbOrTx, id: string, patch: Partial<NewEvidenceRow>) => {
    const [row] = await db.update(evidence).set(patch).where(eq(evidence.id, id)).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(evidence).where(eq(evidence.id, id)),
};

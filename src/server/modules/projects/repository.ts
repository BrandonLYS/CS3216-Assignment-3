import { and, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { projects, type NewProjectRow, type ProjectRow } from "./schema";

export const projectsRepo = {
  listByOwner: (db: DbOrTx, ownerId: string) =>
    db.select().from(projects).where(eq(projects.ownerId, ownerId)).orderBy(desc(projects.updatedAt)),

  findByIdForOwner: async (db: DbOrTx, id: string, ownerId: string): Promise<ProjectRow | undefined> => {
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
    return row;
  },

  insert: async (db: DbOrTx, values: NewProjectRow) => {
    const [row] = await db.insert(projects).values(values).returning();
    return row!;
  },

  update: async (db: DbOrTx, id: string, patch: Partial<NewProjectRow>) => {
    const [row] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(projects).where(eq(projects.id, id)),
};

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

  /**
   * A Project's name without proving ownership. The only caller is the Participant surface,
   * which has no User to own anything and has already proved the Person belongs to this Project
   * (ADR 0009). Deliberately narrow: a Participant must never receive a whole Project row.
   */
  findName: async (db: DbOrTx, id: string): Promise<Pick<ProjectRow, "id" | "name"> | undefined> => {
    const [row] = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, id));
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

import { eq, inArray, or } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { dependencies, type DependencyRow, type NewDependencyRow } from "./schema";

export const dependenciesRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    db.select().from(dependencies).where(eq(dependencies.projectId, projectId)),

  /** Every edge across many projects (workspace overview). */
  listByProjects: (db: DbOrTx, projectIds: string[]) =>
    projectIds.length
      ? db.select().from(dependencies).where(inArray(dependencies.projectId, projectIds))
      : Promise.resolve([]),

  findById: async (db: DbOrTx, id: string): Promise<DependencyRow | undefined> => {
    const [row] = await db.select().from(dependencies).where(eq(dependencies.id, id));
    return row;
  },

  insert: async (db: DbOrTx, values: NewDependencyRow) => {
    const [row] = await db.insert(dependencies).values(values).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(dependencies).where(eq(dependencies.id, id)),

  /** Remove every edge touching an item (called when a task/milestone is deleted). */
  deleteForItem: (db: DbOrTx, itemId: string) =>
    db.delete(dependencies).where(or(eq(dependencies.predecessorId, itemId), eq(dependencies.successorId, itemId))),
};

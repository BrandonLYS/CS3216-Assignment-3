import { and, asc, count, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { milestones } from "@/server/modules/milestones/schema";
import { risks } from "@/server/modules/risks/schema";
import { tasks } from "@/server/modules/tasks/schema";
import type { StatusScope } from "@/shared/domain";
import { statuses, type NewStatusRow, type StatusRow } from "./schema";

const usageTable = { task: tasks, milestone: milestones, risk: risks } as const;

export const statusesRepo = {
  listByProject: (db: DbOrTx, projectId: string, scope?: StatusScope) =>
    db
      .select()
      .from(statuses)
      .where(
        scope ? and(eq(statuses.projectId, projectId), eq(statuses.scope, scope)) : eq(statuses.projectId, projectId),
      )
      .orderBy(asc(statuses.scope), asc(statuses.sortOrder), asc(statuses.createdAt)),

  findById: async (db: DbOrTx, id: string): Promise<StatusRow | undefined> => {
    const [row] = await db.select().from(statuses).where(eq(statuses.id, id));
    return row;
  },

  findDefault: async (db: DbOrTx, projectId: string, scope: StatusScope) => {
    const [row] = await db
      .select()
      .from(statuses)
      .where(and(eq(statuses.projectId, projectId), eq(statuses.scope, scope), eq(statuses.isDefault, true)));
    return row;
  },

  insertMany: (db: DbOrTx, values: NewStatusRow[]) => db.insert(statuses).values(values).returning(),

  update: async (db: DbOrTx, id: string, patch: Partial<NewStatusRow>) => {
    const [row] = await db.update(statuses).set(patch).where(eq(statuses.id, id)).returning();
    return row!;
  },

  clearDefault: (db: DbOrTx, projectId: string, scope: StatusScope) =>
    db
      .update(statuses)
      .set({ isDefault: false })
      .where(and(eq(statuses.projectId, projectId), eq(statuses.scope, scope))),

  delete: (db: DbOrTx, id: string) => db.delete(statuses).where(eq(statuses.id, id)),

  usageCount: async (db: DbOrTx, status: StatusRow): Promise<number> => {
    const table = usageTable[status.scope];
    const [row] = await db.select({ n: count() }).from(table).where(eq(table.statusId, status.id));
    return Number(row?.n ?? 0);
  },
};

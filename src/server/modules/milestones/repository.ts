import { asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { statuses } from "@/server/modules/statuses/schema";
import { milestones, type MilestoneRow, type NewMilestoneRow } from "./schema";

export const milestonesRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    db
      .select({ milestone: milestones, status: statuses })
      .from(milestones)
      .innerJoin(statuses, eq(statuses.id, milestones.statusId))
      .where(eq(milestones.projectId, projectId))
      .orderBy(asc(milestones.dueDate), asc(milestones.sortOrder)),

  listByProjects: (db: DbOrTx, projectIds: string[]) =>
    projectIds.length
      ? db
          .select({ milestone: milestones, status: statuses })
          .from(milestones)
          .innerJoin(statuses, eq(statuses.id, milestones.statusId))
          .where(inArray(milestones.projectId, projectIds))
          .orderBy(asc(milestones.dueDate))
      : Promise.resolve([]),

  findById: async (db: DbOrTx, id: string): Promise<MilestoneRow | undefined> => {
    const [row] = await db.select().from(milestones).where(eq(milestones.id, id));
    return row;
  },

  insert: async (db: DbOrTx, values: NewMilestoneRow) => {
    const [row] = await db.insert(milestones).values(values).returning();
    return row!;
  },

  update: async (db: DbOrTx, id: string, patch: Partial<NewMilestoneRow>) => {
    const [row] = await db.update(milestones).set(patch).where(eq(milestones.id, id)).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(milestones).where(eq(milestones.id, id)),
};

export type MilestoneWithStatus = Awaited<ReturnType<typeof milestonesRepo.listByProject>>[number];

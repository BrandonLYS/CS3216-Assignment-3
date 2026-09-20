import { asc, desc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { people, personPublicColumns } from "@/server/modules/people/schema";
import { statuses } from "@/server/modules/statuses/schema";
import { risks, type NewRiskRow, type RiskRow } from "./schema";

const withJoins = (db: DbOrTx) =>
  db
    .select({ risk: risks, status: statuses, owner: personPublicColumns })
    .from(risks)
    .innerJoin(statuses, eq(statuses.id, risks.statusId))
    .leftJoin(people, eq(people.id, risks.ownerId));

export const risksRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    withJoins(db).where(eq(risks.projectId, projectId)).orderBy(asc(statuses.sortOrder), desc(risks.updatedAt)),

  listByProjects: (db: DbOrTx, projectIds: string[]) =>
    projectIds.length ? withJoins(db).where(inArray(risks.projectId, projectIds)) : Promise.resolve([]),

  findById: async (db: DbOrTx, id: string): Promise<RiskRow | undefined> => {
    const [row] = await db.select().from(risks).where(eq(risks.id, id));
    return row;
  },

  insert: async (db: DbOrTx, values: NewRiskRow) => {
    const [row] = await db.insert(risks).values(values).returning();
    return row!;
  },

  update: async (db: DbOrTx, id: string, patch: Partial<NewRiskRow>) => {
    const [row] = await db.update(risks).set(patch).where(eq(risks.id, id)).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(risks).where(eq(risks.id, id)),
};

export type RiskListItem = Awaited<ReturnType<typeof risksRepo.listByProject>>[number];

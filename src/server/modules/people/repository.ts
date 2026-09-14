import { asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { people, teams, type PersonRow, type TeamRow } from "./schema";

export const peopleRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    db.select().from(people).where(eq(people.projectId, projectId)).orderBy(asc(people.name)),
  findById: async (db: DbOrTx, id: string): Promise<PersonRow | undefined> => {
    const [row] = await db.select().from(people).where(eq(people.id, id));
    return row;
  },
  insert: async (db: DbOrTx, values: typeof people.$inferInsert) => {
    const [row] = await db.insert(people).values(values).returning();
    return row!;
  },
  update: async (db: DbOrTx, id: string, patch: Partial<typeof people.$inferInsert>) => {
    const [row] = await db.update(people).set(patch).where(eq(people.id, id)).returning();
    return row!;
  },
  delete: (db: DbOrTx, id: string) => db.delete(people).where(eq(people.id, id)),
};

export const teamsRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    db.select().from(teams).where(eq(teams.projectId, projectId)).orderBy(asc(teams.name)),
  findById: async (db: DbOrTx, id: string): Promise<TeamRow | undefined> => {
    const [row] = await db.select().from(teams).where(eq(teams.id, id));
    return row;
  },
  insert: async (db: DbOrTx, values: typeof teams.$inferInsert) => {
    const [row] = await db.insert(teams).values(values).returning();
    return row!;
  },
  update: async (db: DbOrTx, id: string, patch: Partial<typeof teams.$inferInsert>) => {
    const [row] = await db.update(teams).set(patch).where(eq(teams.id, id)).returning();
    return row!;
  },
  delete: (db: DbOrTx, id: string) => db.delete(teams).where(eq(teams.id, id)),
};

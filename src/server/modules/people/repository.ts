import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { people, personPublicColumns, teams, type PersonCredentialsRow, type PersonRow, type TeamRow } from "./schema";

/**
 * Reads and writes project the public columns explicitly (never `select()` or a bare
 * `returning()`): these rows are handed to client components by `loadProjectRefs` and into the
 * Assistant's prompt by `get_project_summary`, and the messaging credentials must reach neither.
 */
export const peopleRepo = {
  listByProject: (db: DbOrTx, projectId: string): Promise<PersonRow[]> =>
    db.select(personPublicColumns).from(people).where(eq(people.projectId, projectId)).orderBy(asc(people.name)),
  findById: async (db: DbOrTx, id: string): Promise<PersonRow | undefined> => {
    const [row] = await db.select(personPublicColumns).from(people).where(eq(people.id, id));
    return row;
  },
  insert: async (db: DbOrTx, values: typeof people.$inferInsert): Promise<PersonRow> => {
    const [row] = await db.insert(people).values(values).returning(personPublicColumns);
    return row!;
  },
  update: async (db: DbOrTx, id: string, patch: Partial<typeof people.$inferInsert>): Promise<PersonRow> => {
    const [row] = await db.update(people).set(patch).where(eq(people.id, id)).returning(personPublicColumns);
    return row!;
  },
  delete: (db: DbOrTx, id: string) => db.delete(people).where(eq(people.id, id)),

  /**
   * The one read that returns credentials, for the messaging login only (ADR 0009). Matched
   * case-insensitively on the same expression as the `people_project_email_uq` index.
   */
  findCredentialsByEmail: async (
    db: DbOrTx,
    projectId: string,
    email: string,
  ): Promise<PersonCredentialsRow | undefined> => {
    const [row] = await db
      .select({
        id: people.id,
        projectId: people.projectId,
        name: people.name,
        email: people.email,
        passwordHash: people.passwordHash,
        inviteTokenHash: people.inviteTokenHash,
        inviteExpiresAt: people.inviteExpiresAt,
      })
      .from(people)
      .where(
        and(eq(people.projectId, projectId), isNotNull(people.email), sql`lower(${people.email}) = lower(${email})`),
      );
    return row;
  },
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

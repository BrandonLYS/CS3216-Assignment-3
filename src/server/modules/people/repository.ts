import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
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
   * The one read that returns credentials, for the messaging login only (ADR 0009).
   *
   * Matched on exactly the same expression *and predicate* as `people_project_email_uq`:
   * case-insensitive, and restricted to People who hold an invite or a password. Two People in
   * one Project may legitimately share an address while neither is invited, so without the
   * predicate this could match an uninvited namesake and return null credentials in place of
   * the real account. With it, the index guarantees at most one row.
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
        and(
          eq(people.projectId, projectId),
          isNotNull(people.email),
          sql`lower(${people.email}) = lower(${email})`,
          sql`(${people.passwordHash} is not null or ${people.inviteTokenHash} is not null)`,
        ),
      );
    return row;
  },

  /**
   * Issue or re-issue a Person's invite. Overwriting the hash is what invalidates the previous
   * link, so a PM re-inviting someone never leaves two live tokens.
   */
  setInvite: (db: DbOrTx, id: string, inviteTokenHash: string, inviteExpiresAt: Date) =>
    db.update(people).set({ inviteTokenHash, inviteExpiresAt }).where(eq(people.id, id)),

  /**
   * Accept an invite: set the password and burn the token in one statement, so two tabs racing
   * on the same link cannot both succeed and an expired token cannot be spent. No row back means
   * unknown, expired or already used, and the caller must not distinguish the three.
   */
  acceptInvite: async (
    db: DbOrTx,
    inviteTokenHash: string,
    passwordHash: string,
  ): Promise<Pick<PersonRow, "id" | "projectId" | "name"> | undefined> => {
    const [row] = await db
      .update(people)
      .set({ passwordHash, inviteTokenHash: null, inviteExpiresAt: null })
      .where(and(eq(people.inviteTokenHash, inviteTokenHash), sql`${people.inviteExpiresAt} > now()`))
      .returning({ id: people.id, projectId: people.projectId, name: people.name });
    return row;
  },

  /**
   * The Person a live invite belongs to, so the accept page can greet them by name. Returns no
   * credential column, and an expired token looks exactly like an unknown one.
   */
  findLiveInvitee: async (
    db: DbOrTx,
    inviteTokenHash: string,
  ): Promise<Pick<PersonRow, "id" | "projectId" | "name" | "email"> | undefined> => {
    const [row] = await db
      .select({ id: people.id, projectId: people.projectId, name: people.name, email: people.email })
      .from(people)
      .where(and(eq(people.inviteTokenHash, inviteTokenHash), sql`${people.inviteExpiresAt} > now()`));
    return row;
  },

  /** Write a password directly. Used by the seed; the app's only other writer is `acceptInvite`. */
  setPassword: (db: DbOrTx, id: string, passwordHash: string) =>
    db.update(people).set({ passwordHash }).where(eq(people.id, id)),

  /**
   * Whether anyone else in the Project already holds messaging credentials on this address,
   * matched on exactly the expression and predicate of `people_project_email_uq`. The index is
   * the guarantee; this read only exists so the PM gets a sentence instead of a driver error.
   */
  emailTakenByOther: (db: DbOrTx, projectId: string, email: string, exceptPersonId: string): Promise<boolean> =>
    db
      .select({ one: sql<number>`1` })
      .from(people)
      .where(
        and(
          eq(people.projectId, projectId),
          ne(people.id, exceptPersonId),
          sql`lower(${people.email}) = lower(${email})`,
          sql`(${people.passwordHash} is not null or ${people.inviteTokenHash} is not null)`,
        ),
      )
      .limit(1)
      .then((xs) => xs.length > 0),

  /** The three messaging states of a Project's People, for the PM's Participants dialog. */
  listMessagingStates: (db: DbOrTx, projectId: string) =>
    db
      .select({
        personId: people.id,
        state: sql<"none" | "invited" | "active">`case
          when ${people.passwordHash} is not null then 'active'
          when ${people.inviteTokenHash} is not null and ${people.inviteExpiresAt} > now() then 'invited'
          else 'none' end`,
        inviteExpiresAt: people.inviteExpiresAt,
      })
      .from(people)
      .where(eq(people.projectId, projectId)),
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

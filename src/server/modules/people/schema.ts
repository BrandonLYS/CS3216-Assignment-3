import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "@/server/auth/schema";
import { id, timestamps } from "@/server/db/columns";
import { projects } from "@/server/modules/projects/schema";

export const teams = pgTable(
  "teams",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [index("teams_project_idx").on(t.projectId)],
);

export const people = pgTable(
  "people",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    /** Optional link to a signed-in account (ADR 0004). Not the messaging login; see ADR 0009. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /**
     * Messaging-only credentials (ADR 0009). A Person with a `passwordHash` can sign in to the
     * messaging surface and see their Rooms, nothing else. The invite token is stored hashed so
     * the database never holds a usable link; it is single-use and cleared on acceptance.
     */
    passwordHash: text("password_hash"),
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("people_project_idx").on(t.projectId),
    /**
     * `email` is the messaging login identifier, so it must identify one Person per Project -
     * but only among People who can actually log in. Two People in one Project have always been
     * allowed to share an address (the roster is a directory, not an account list), and an
     * unconditional unique index would fail to apply against any database already holding such
     * a pair. Restricting it to invited People leaves existing data untouched and moves the
     * clash to the moment a PM invites a second Person on an address already in use, which is
     * where it can be reported and resolved.
     */
    uniqueIndex("people_project_email_uq")
      .on(t.projectId, sql`lower(${t.email})`)
      .where(sql`${t.email} is not null and (${t.passwordHash} is not null or ${t.inviteTokenHash} is not null)`),
  ],
);

/**
 * Every column of a Person except the messaging credentials. `peopleRepo` selects this and
 * never `select()`, because a Person row reaches the browser through `loadProjectRefs` and is
 * serialised into the Assistant's prompt by `get_project_summary`. A password hash must reach
 * neither. The credential columns are read only by the messaging login, through
 * `peopleRepo.findCredentialsByEmail`.
 */
export const personPublicColumns = {
  id: people.id,
  projectId: people.projectId,
  name: people.name,
  role: people.role,
  email: people.email,
  teamId: people.teamId,
  userId: people.userId,
  createdAt: people.createdAt,
  updatedAt: people.updatedAt,
} as const;

export type TeamRow = typeof teams.$inferSelect;
/** A Person as the rest of the app sees them: no credentials. See `personPublicColumns`. */
export type PersonRow = { [K in keyof typeof personPublicColumns]: (typeof people.$inferSelect)[K] };
export type PersonCredentialsRow = Pick<
  typeof people.$inferSelect,
  "id" | "projectId" | "name" | "email" | "passwordHash" | "inviteTokenHash" | "inviteExpiresAt"
>;

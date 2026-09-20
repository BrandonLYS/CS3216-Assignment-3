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
    // `email` is the messaging login identifier, so it must identify one Person per Project.
    uniqueIndex("people_project_email_uq")
      .on(t.projectId, sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
  ],
);

export type TeamRow = typeof teams.$inferSelect;
export type PersonRow = typeof people.$inferSelect;

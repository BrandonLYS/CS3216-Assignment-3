import { index, pgTable, text } from "drizzle-orm/pg-core";
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
    /** Optional link to a signed-in account (ADR 0004). */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("people_project_idx").on(t.projectId)],
);

export type TeamRow = typeof teams.$inferSelect;
export type PersonRow = typeof people.$inferSelect;

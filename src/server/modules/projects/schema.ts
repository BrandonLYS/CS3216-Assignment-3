import { date, index, pgTable, text } from "drizzle-orm/pg-core";
import { user } from "@/server/auth/schema";
import { id, timestamps } from "@/server/db/columns";
import { healthLevelEnum, projectStatusEnum } from "@/server/db/enums";

export const projects = pgTable(
  "projects",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Short uppercase key used as a prefix for task identifiers, e.g. "PAY". */
    key: text("key").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("active"),
    health: healthLevelEnum("health").notNull().default("green"),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    ...timestamps,
  },
  (t) => [index("projects_owner_idx").on(t.ownerId)],
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

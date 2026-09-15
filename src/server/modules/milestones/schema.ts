import { date, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/server/db/columns";
import { people } from "@/server/modules/people/schema";
import { projects } from "@/server/modules/projects/schema";
import { statuses } from "@/server/modules/statuses/schema";

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    statusId: text("status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "restrict" }),
    dueDate: date("due_date").notNull(),
    ownerId: text("owner_id").references(() => people.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    reachedAt: timestamp("reached_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("milestones_project_idx").on(t.projectId)],
);

export type MilestoneRow = typeof milestones.$inferSelect;
export type NewMilestoneRow = typeof milestones.$inferInsert;

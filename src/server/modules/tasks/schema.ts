import { date, index, integer, pgTable, primaryKey, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/server/db/columns";
import { priorityEnum } from "@/server/db/enums";
import { labels } from "@/server/modules/labels/schema";
import { milestones } from "@/server/modules/milestones/schema";
import { people, teams } from "@/server/modules/people/schema";
import { projects } from "@/server/modules/projects/schema";
import { statuses } from "@/server/modules/statuses/schema";

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Per-project sequence, rendered as `${project.key}-${number}`. */
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    statusId: text("status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "restrict" }),
    priority: priorityEnum("priority").notNull().default("none"),
    assigneeId: text("assignee_id").references(() => people.id, { onDelete: "set null" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    milestoneId: text("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    estimateHours: real("estimate_hours"),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    index("tasks_status_idx").on(t.statusId),
    index("tasks_milestone_idx").on(t.milestoneId),
    unique("tasks_project_number_uq").on(t.projectId, t.number),
  ],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })],
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;

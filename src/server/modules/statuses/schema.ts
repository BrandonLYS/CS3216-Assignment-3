import { boolean, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/server/db/columns";
import { statusCategoryEnum, statusScopeEnum } from "@/server/db/enums";
import { projects } from "@/server/modules/projects/schema";

/** User-editable status per project; `category` carries the system meaning (ADR 0003). */
export const statuses = pgTable(
  "statuses",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    scope: statusScopeEnum("scope").notNull(),
    category: statusCategoryEnum("category").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Assigned to new items of this scope when none is specified. One per project+scope. */
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("statuses_project_scope_idx").on(t.projectId, t.scope),
    unique("statuses_project_scope_name_uq").on(t.projectId, t.scope, t.name),
  ],
);

export type StatusRow = typeof statuses.$inferSelect;
export type NewStatusRow = typeof statuses.$inferInsert;

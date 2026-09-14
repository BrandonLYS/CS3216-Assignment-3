import { index, pgTable, text, unique } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/server/db/columns";
import { dependencyItemTypeEnum, dependencyTypeEnum } from "@/server/db/enums";
import { projects } from "@/server/modules/projects/schema";

/**
 * `successor` cannot proceed until `predecessor` is done.
 * Endpoints are polymorphic (task | milestone); integrity is enforced in the service.
 */
export const dependencies = pgTable(
  "dependencies",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    predecessorType: dependencyItemTypeEnum("predecessor_type").notNull(),
    predecessorId: text("predecessor_id").notNull(),
    successorType: dependencyItemTypeEnum("successor_type").notNull(),
    successorId: text("successor_id").notNull(),
    type: dependencyTypeEnum("type").notNull().default("finish_to_start"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("dependencies_project_idx").on(t.projectId),
    index("dependencies_pred_idx").on(t.predecessorId),
    index("dependencies_succ_idx").on(t.successorId),
    unique("dependencies_edge_uq").on(t.predecessorId, t.successorId),
  ],
);

export type DependencyRow = typeof dependencies.$inferSelect;
export type NewDependencyRow = typeof dependencies.$inferInsert;

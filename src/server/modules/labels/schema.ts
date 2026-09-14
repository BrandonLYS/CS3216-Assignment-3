import { index, pgTable, text, unique } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/server/db/columns";
import { projects } from "@/server/modules/projects/schema";

export const labels = pgTable(
  "labels",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    ...timestamps,
  },
  (t) => [index("labels_project_idx").on(t.projectId), unique("labels_project_name_uq").on(t.projectId, t.name)],
);

export type LabelRow = typeof labels.$inferSelect;

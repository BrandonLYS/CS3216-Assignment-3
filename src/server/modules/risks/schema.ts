import { date, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { id, timestamps } from "@/server/db/columns";
import { scaleLevelEnum } from "@/server/db/enums";
import { people } from "@/server/modules/people/schema";
import { projects } from "@/server/modules/projects/schema";
import { statuses } from "@/server/modules/statuses/schema";

export const risks = pgTable(
  "risks",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Per-project sequence, rendered as `R-${number}`. */
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    cause: text("cause"),
    impactDescription: text("impact_description"),
    probability: scaleLevelEnum("probability").notNull().default("medium"),
    impact: scaleLevelEnum("impact").notNull().default("medium"),
    statusId: text("status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "restrict" }),
    ownerId: text("owner_id").references(() => people.id, { onDelete: "set null" }),
    mitigation: text("mitigation"),
    reviewDate: date("review_date"),
    ...timestamps,
  },
  (t) => [index("risks_project_idx").on(t.projectId), unique("risks_project_number_uq").on(t.projectId, t.number)],
);

export type RiskRow = typeof risks.$inferSelect;
export type NewRiskRow = typeof risks.$inferInsert;

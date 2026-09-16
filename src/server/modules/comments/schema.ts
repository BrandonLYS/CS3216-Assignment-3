import { date, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/server/auth/schema";
import { id } from "@/server/db/columns";
import { entityTypeEnum } from "@/server/db/enums";
import { people } from "@/server/modules/people/schema";
import { projects } from "@/server/modules/projects/schema";

/** A short, immutable, dated statement attached to one Task, Risk or Milestone. */
export const comments = pgTable(
  "comments",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Polymorphic target; same shape as activity_events. Validation restricts to COMMENTABLE_ENTITY_TYPES. */
    entityType: entityTypeEnum("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    body: text("body").notNull(),
    saidById: text("said_by_id").references(() => people.id, { onDelete: "set null" }),
    /** Name of the Person at posting time so attribution survives their removal ("Unknown person"). */
    saidByName: text("said_by_name"),
    saidOn: date("said_on"),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_entity_idx").on(t.entityType, t.entityId), index("comments_project_idx").on(t.projectId)],
);

export type CommentRow = typeof comments.$inferSelect;
export type NewCommentRow = typeof comments.$inferInsert;

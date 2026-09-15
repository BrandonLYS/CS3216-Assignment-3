import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/server/auth/schema";
import { id } from "@/server/db/columns";
import { activityActionEnum, entityTypeEnum } from "@/server/db/enums";
import { projects } from "@/server/modules/projects/schema";

/** Immutable record of one field change (ADR 0005). */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    entityType: entityTypeEnum("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** Human-readable label of the entity at the time, so history survives deletion. */
    entityLabel: text("entity_label").notNull(),
    action: activityActionEnum("action").notNull(),
    /** Null for created/deleted; set for updated. */
    field: text("field"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_project_time_idx").on(t.projectId, t.occurredAt),
    index("activity_entity_idx").on(t.entityType, t.entityId),
  ],
);

export type ActivityEventRow = typeof activityEvents.$inferSelect;
export type NewActivityEventRow = typeof activityEvents.$inferInsert;

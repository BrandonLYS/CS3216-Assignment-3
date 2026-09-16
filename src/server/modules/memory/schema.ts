import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/server/auth/schema";
import { id } from "@/server/db/columns";
import { memoryAuthorEnum } from "@/server/db/enums";
import { conversations } from "@/server/modules/assistant/schema";
import { projects } from "@/server/modules/projects/schema";

/**
 * One version of a User's Profile (`projectId` null) or of their Working Memory for a Project.
 * Versions are append-only; the newest row is the current document. Reflection versions record
 * the Conversation and the last Message they read (ADR 0007).
 */
export const memoryVersions = pgTable(
  "memory_versions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    author: memoryAuthorEnum("author").notNull(),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    throughMessageId: text("through_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memory_versions_doc_idx").on(t.userId, t.projectId, t.createdAt)],
);

export type MemoryVersionRow = typeof memoryVersions.$inferSelect;

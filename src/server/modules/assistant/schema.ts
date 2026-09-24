import { index, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "@/server/auth/schema";
import { id, timestamps } from "@/server/db/columns";
import { messageRoleEnum } from "@/server/db/enums";
import { userAiConfigs } from "@/server/modules/ai-config/schema";
import { projects } from "@/server/modules/projects/schema";

/** One thread between a User and the Assistant about one Project (or none, on the dashboard). */
export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    /** The credential this thread answers with; null falls back to the User's default. */
    aiConfigId: text("ai_config_id").references(() => userAiConfigs.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [unique("conversations_user_project_unique").on(t.userId, t.projectId).nullsNotDistinct()],
);

/**
 * One turn, stored in the AI SDK UIMessage shape: text and tool calls/results live in `parts`.
 * `id` is the client-generated UIMessage id, so it is only unique within its Conversation.
 */
export const messages = pgTable(
  "messages",
  {
    id: text("id").notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    parts: jsonb("parts").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.id] }),
    index("messages_conversation_time_idx").on(t.conversationId, t.createdAt),
  ],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

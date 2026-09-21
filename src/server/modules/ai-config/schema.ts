import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "@/server/auth/schema";
import { aiProviderEnum } from "@/server/db/enums";

/** A User-owned credential, deliberately outside Project Activity Events. */
export const userAiConfigs = pgTable("user_ai_configs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: aiProviderEnum("provider").notNull(),
  model: text("model").notNull(),
  baseUrl: text("base_url"),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UserAiConfigRow = typeof userAiConfigs.$inferSelect;

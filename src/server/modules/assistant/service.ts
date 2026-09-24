import type { UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError } from "@/server/core/errors";
import { userAiConfigs } from "@/server/modules/ai-config/schema";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { conversationsRepo, messagesRepo } from "./repository";

/** Start of the current UTC day; the daily turn cap resets here. */
const startOfToday = () => new Date(new Date().toISOString().slice(0, 10));

/**
 * Conversations and Messages are the Assistant's own thread, not Project items: they carry no
 * Activity Event and no domain event (ADR 0007), so these writes do not go through `mutate`.
 */
export const assistantService = {
  /**
   * The User's Conversation for a Project, or their dashboard Conversation when `projectId` is
   * null (created on first open), with its Messages oldest first.
   */
  conversation: async (ctx: Ctx, projectId: string | null) => {
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    const conversation = await conversationsRepo.findOrCreate(ctx.db, ctx.userId, projectId);
    const rows = await messagesRepo.listByConversation(ctx.db, conversation.id);
    return { conversation, messages: rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts }) as UIMessage) };
  },

  /** Persist the full thread after a turn; existing Messages are updated in place by id. */
  saveMessages: async (ctx: Ctx, conversationId: string, msgs: UIMessage[]) => {
    const conversation = await conversationsRepo.findById(ctx.db, conversationId);
    if (!conversation || conversation.userId !== ctx.userId) throw new ForbiddenError("Conversation not found");
    await messagesRepo.upsertMany(
      ctx.db,
      msgs.map((m) => ({ id: m.id, conversationId, role: m.role, parts: m.parts })),
    );
  },

  /** Pin the Conversation to one of the User's saved configurations (or clear the pin with null). */
  selectModel: async (ctx: Ctx, conversationId: string, aiConfigId: string | null) => {
    const conversation = await conversationsRepo.findById(ctx.db, conversationId);
    if (!conversation || conversation.userId !== ctx.userId) throw new ForbiddenError("Conversation not found");
    if (aiConfigId) {
      const [config] = await ctx.db
        .select({ id: userAiConfigs.id })
        .from(userAiConfigs)
        .where(and(eq(userAiConfigs.id, aiConfigId), eq(userAiConfigs.userId, ctx.userId)))
        .limit(1);
      if (!config) throw new ForbiddenError("Assistant configuration not found");
    }
    await conversationsRepo.setAiConfig(ctx.db, conversationId, aiConfigId);
  },

  turnsToday: (ctx: Ctx) => messagesRepo.countUserMessagesSince(ctx.db, ctx.userId, startOfToday()),
};

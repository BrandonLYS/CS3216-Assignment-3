import type { UIMessage } from "ai";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError, ValidationError } from "@/server/core/errors";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { conversationsRepo, messagesRepo, toolPermissionsRepo } from "./repository";
import { ASSISTANT_TOOLS } from "./tools";

/** Start of the current UTC day; the daily turn cap resets here. */
const startOfToday = () => new Date(new Date().toISOString().slice(0, 10));

/**
 * Conversations and Messages are the Assistant's own thread, not Project items: they carry no
 * Activity Event and no domain event (ADR 0007), so these writes do not go through `mutate`.
 */
export const assistantService = {
  /**
   * Everything the dock needs to open: the User's Conversations in this scope newest first, and
   * the latest one with its Messages oldest first. A User may hold several Conversations per
   * scope and resume any of them; the first is created on first open.
   */
  dock: async (ctx: Ctx, projectId: string | null) => {
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    let conversations = await conversationsRepo.listByScope(ctx.db, ctx.userId, projectId);
    if (!conversations.length) conversations = [await conversationsRepo.create(ctx.db, ctx.userId, projectId)];
    const latest = (await conversationsRepo.latest(ctx.db, ctx.userId, projectId)) ?? conversations[0]!;
    // Empty Conversations are litter, not history: drop any that are not the active one or pinned.
    const pruned = await conversationsRepo.pruneEmpty(ctx.db, ctx.userId, projectId, latest.id);
    if (pruned.length) {
      const gone = new Set(pruned.map((r) => r.id));
      conversations = conversations.filter((c) => !gone.has(c.id));
    }
    // Backfill titles for Conversations saved before titling: first user Message, persisted so it is a one-off cost.
    conversations = await Promise.all(
      conversations.map(async (c) => {
        if (c.title) return c;
        const text = await messagesRepo.firstUserText(ctx.db, c.id);
        if (!text) return c;
        const title = text.slice(0, 80);
        await conversationsRepo.setTitle(ctx.db, c.id, title);
        return { ...c, title };
      }),
    );
    const thread = await assistantService.thread(ctx, latest.id);
    return {
      conversations: conversations.map(({ id, title, pinned, updatedAt }) => ({ id, title, pinned, updatedAt })),
      thread,
    };
  },

  /** The User's most recent Conversation in a scope, or their dashboard one when `projectId` is null. */
  conversation: async (ctx: Ctx, projectId: string | null) => {
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    const conversation =
      (await conversationsRepo.latest(ctx.db, ctx.userId, projectId)) ??
      (await conversationsRepo.create(ctx.db, ctx.userId, projectId));
    const rows = await messagesRepo.listByConversation(ctx.db, conversation.id);
    return { conversation, messages: rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts }) as UIMessage) };
  },

  /** One Conversation the User owns, with its Messages oldest first. */
  thread: async (ctx: Ctx, conversationId: string) => {
    const conversation = await assistantService.getConversation(ctx, conversationId);
    const rows = await messagesRepo.listByConversation(ctx.db, conversation.id);
    return {
      conversation,
      messages: rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts }) as UIMessage),
    };
  },

  /** Start a new empty Conversation in a scope. */
  createConversation: async (ctx: Ctx, projectId: string | null) => {
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return conversationsRepo.create(ctx.db, ctx.userId, projectId);
  },

  /** Pin or unpin a Conversation the User owns; pinned ones sort first in the history list. */
  pinConversation: async (ctx: Ctx, conversationId: string, pinned: boolean) => {
    await assistantService.getConversation(ctx, conversationId);
    await conversationsRepo.setPinned(ctx.db, conversationId, pinned);
  },

  /** The Conversation row if it belongs to the User, else Forbidden. */
  getConversation: async (ctx: Ctx, conversationId: string) => {
    const conversation = await conversationsRepo.findById(ctx.db, conversationId);
    if (!conversation || conversation.userId !== ctx.userId) throw new ForbiddenError("Conversation not found");
    return conversation;
  },

  /** Persist the full thread after a turn; existing Messages are updated in place by id. */
  saveMessages: async (ctx: Ctx, conversationId: string, msgs: UIMessage[]) => {
    const conversation = await conversationsRepo.findById(ctx.db, conversationId);
    if (!conversation || conversation.userId !== ctx.userId) throw new ForbiddenError("Conversation not found");
    await messagesRepo.upsertMany(
      ctx.db,
      msgs.map((m) => ({ id: m.id, conversationId, role: m.role, parts: m.parts })),
    );
    await conversationsRepo.touch(ctx.db, conversationId);
    if (!conversation.title) {
      const firstText = msgs.flatMap((m) => (m.role === "user" ? m.parts : [])).find((p) => p.type === "text");
      const title = firstText && "text" in firstText ? firstText.text.trim().slice(0, 80) : "";
      if (title) await conversationsRepo.setTitle(ctx.db, conversationId, title);
    }
  },

  turnsToday: (ctx: Ctx) => messagesRepo.countUserMessagesSince(ctx.db, ctx.userId, startOfToday()),

  /**
   * Standing approvals ("always allow") for write tools, per scope. Like Conversations these are
   * the Assistant's own documents, not Project items: no Activity Event, no `mutate` (ADR 0011).
   * `projectId` null means the dashboard scope.
   */
  permissions: async (ctx: Ctx, projectId: string | null) => {
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return toolPermissionsRepo.listToolNames(ctx.db, ctx.userId, projectId);
  },

  grantPermission: async (ctx: Ctx, projectId: string | null, toolName: string) => {
    const tool = ASSISTANT_TOOLS.find((t) => t.name === toolName);
    if (!tool?.mutates) throw new ValidationError("Only write tools can be always-allowed");
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    await toolPermissionsRepo.grant(ctx.db, ctx.userId, projectId, toolName);
  },

  revokePermission: async (ctx: Ctx, projectId: string | null, toolName: string) => {
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    await toolPermissionsRepo.revoke(ctx.db, ctx.userId, projectId, toolName);
  },

  /** Grant or revoke several write tools in one call — backs the grouped settings toggles. */
  setPermissions: async (ctx: Ctx, projectId: string | null, toolNames: string[], allowed: boolean) => {
    for (const name of toolNames) {
      if (!ASSISTANT_TOOLS.find((t) => t.name === name)?.mutates)
        throw new ValidationError("Only write tools can be always-allowed");
    }
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    for (const toolName of toolNames) {
      if (allowed) await toolPermissionsRepo.grant(ctx.db, ctx.userId, projectId, toolName);
      else await toolPermissionsRepo.revoke(ctx.db, ctx.userId, projectId, toolName);
    }
  },
};

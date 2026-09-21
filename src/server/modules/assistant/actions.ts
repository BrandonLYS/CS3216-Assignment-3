"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { assistantService } from "./service";

const schema = z.object({
  projectId: z.string().nullable(),
  toolName: z.string().min(1),
});

/** "Always allow" on an approval card: remember the grant for this scope (ADR 0011). */
export async function grantToolPermissionAction(input: { projectId: string | null; toolName: string }) {
  return runAction(schema, input, (ctx, i) => assistantService.grantPermission(ctx, i.projectId, i.toolName));
}

export async function revokeToolPermissionAction(input: { projectId: string | null; toolName: string }) {
  return runAction(schema, input, (ctx, i) => assistantService.revokePermission(ctx, i.projectId, i.toolName));
}

const bulkSchema = z.object({
  projectId: z.string().nullable(),
  toolNames: z.array(z.string().min(1)).min(1),
  allowed: z.boolean(),
});

/** Settings toggles: switch one tool or a whole group on/off in a scope (ADR 0011). */
export async function setToolPermissionsAction(input: {
  projectId: string | null;
  toolNames: string[];
  allowed: boolean;
}) {
  return runAction(bulkSchema, input, (ctx, i) =>
    assistantService.setPermissions(ctx, i.projectId, i.toolNames, i.allowed),
  );
}

const createConversationSchema = z.object({ projectId: z.string().nullable() });

/** "New chat" in the dock: a fresh Conversation in this scope. */
export async function createConversationAction(input: { projectId: string | null }) {
  return runAction(createConversationSchema, input, async (ctx, i) => {
    const conversation = await assistantService.createConversation(ctx, i.projectId);
    return { id: conversation.id };
  });
}

const loadConversationSchema = z.object({ conversationId: z.string().min(1) });

/** Pick a Conversation from the history list: returns its Messages for the dock to mount. */
export async function loadConversationAction(input: { conversationId: string }) {
  return runAction(loadConversationSchema, input, async (ctx, i) => {
    const thread = await assistantService.thread(ctx, i.conversationId);
    return { messages: thread.messages };
  });
}

const pinSchema = z.object({ conversationId: z.string().min(1), pinned: z.boolean() });

/** Pin or unpin a Conversation in the history list. */
export async function pinConversationAction(input: { conversationId: string; pinned: boolean }) {
  return runAction(pinSchema, input, (ctx, i) => assistantService.pinConversation(ctx, i.conversationId, i.pinned));
}

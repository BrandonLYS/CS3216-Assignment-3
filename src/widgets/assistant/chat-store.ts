"use client";

import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import type { useRouter } from "next/navigation";

/**
 * Module-level registry of Chat instances keyed by Conversation id. Chats live outside React so
 * several can stream in parallel and survive unmounts: switching chats, closing the dock, or
 * navigating between pages keeps their turns in flight.
 */
const chats = new Map<string, Chat<UIMessage>>();

/** The Chat for a Conversation: the existing one when present, else a fresh one built by `init`. */
export function ensureChat(conversationId: string, init: () => Chat<UIMessage>): Chat<UIMessage> {
  const existing = chats.get(conversationId);
  if (existing) return existing;
  const chat = init();
  chats.set(conversationId, chat);
  return chat;
}

/** The live Chat for a Conversation, or undefined when none was opened this session. */
export function getChat(conversationId: string): Chat<UIMessage> | undefined {
  return chats.get(conversationId);
}

/** Drop a Chat from the registry, aborting its turn first when one is still in flight. */
export function dropChat(conversationId: string): void {
  const chat = chats.get(conversationId);
  if (!chat) return;
  if (chat.status === "submitted" || chat.status === "streaming") chat.stop().catch(() => {});
  chats.delete(conversationId);
}

/**
 * Build a Chat for one Conversation: it posts to the Assistant route with its id, auto-continues
 * after tool approvals, and follows a finished turn to a Project it opened or created.
 */
export function makeChat(conversationId: string, initialMessages: UIMessage[], router: ReturnType<typeof useRouter>) {
  return new Chat<UIMessage>({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/assistant/chat", body: { conversationId } }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message }) => {
      const openedId = message.parts
        .filter(
          (p) =>
            isToolUIPart(p) &&
            (getToolName(p) === "create_project" || getToolName(p) === "open_project") &&
            p.state === "output-available",
        )
        .map((p) => (p as { output?: { id?: unknown } }).output?.id)
        .findLast((id) => typeof id === "string");
      if (openedId) router.push(`/projects/${openedId}`);
      else router.refresh();
    },
  });
}

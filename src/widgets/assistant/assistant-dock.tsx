"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { ArrowUp, History, Loader2, Pin, Sparkles, SquarePen, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useShell } from "@/shared/lib/shell-context";
import {
  createConversationAction,
  grantToolPermissionAction,
  loadConversationAction,
  pinConversationAction,
} from "@/server/modules/assistant/actions";
import { ASSISTANT_LIMIT_REACHED, ASSISTANT_NOT_CONFIGURED } from "@/shared/lib/assistant-errors";
import { cn } from "@/shared/lib/cn";
import { relative } from "@/shared/lib/dates";
import { Button, Panel, SectionTitle, Textarea } from "@/shared/ui";
import { LinkedText } from "./linked-text";
import { ToolCall } from "./tool-call";

const FRIENDLY: Record<string, string> = {
  [ASSISTANT_NOT_CONFIGURED]: "The Assistant is not configured. Set OPENAI_API_KEY to enable it.",
  [ASSISTANT_LIMIT_REACHED]: "You have reached today's Assistant limit. It resets at midnight UTC.",
};

const isPendingCard = (part: UIMessage["parts"][number]) => isToolUIPart(part) && part.state === "approval-requested";

type ProjectSummary = {
  project?: { name?: string; key?: string } | null;
  milestones?: { name?: string; targetDate?: string }[];
  tasks?: { number?: number; title?: string; status?: string }[];
  risks?: { name?: string }[];
};

export type ConversationSummary = { id: string; title: string | null; pinned: boolean; updatedAt: Date };
export type AssistantThread = { conversation: { id: string }; messages: UIMessage[] };

function latestSummary(messages: UIMessage[]): ProjectSummary | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    for (let j = m.parts.length - 1; j >= 0; j--) {
      const part = m.parts[j];
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      const name = getToolName(part);
      if (name === "get_project_summary" && part.output && typeof part.output === "object") {
        return part.output as ProjectSummary;
      }
      if (name === "list_projects" && Array.isArray(part.output)) {
        return {
          project: null,
          milestones: [],
          tasks: part.output as unknown as { number: number; title: string; status: string }[],
          risks: [],
        };
      }
    }
  }
  return null;
}

function CurrentState({ messages }: { messages: UIMessage[] }) {
  const summary = latestSummary(messages);
  if (!summary) return null;
  const milestones = summary.milestones ?? [];
  const tasks = summary.tasks ?? [];
  const risks = summary.risks ?? [];
  return (
    <Panel className="mb-3 p-3">
      <SectionTitle className="mb-2">Current state</SectionTitle>
      {summary.project && summary.project.name && (
        <p className="mb-2 truncate text-body-sm font-medium text-ink">
          {summary.project.key ? `${summary.project.key} · ` : ""}
          {summary.project.name}
        </p>
      )}
      {milestones.length > 0 && (
        <div className="mb-2">
          <p className="text-caption text-ink-subtle">Milestones</p>
          <ul className="mt-1 space-y-0.5">
            {milestones.map((m, i) => (
              <li key={i} className="truncate text-caption text-ink-subtle">
                {m.targetDate ? `${m.targetDate} · ` : ""}
                {m.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {tasks.length > 0 && (
        <div className="mb-2">
          <p className="text-caption text-ink-subtle">Tasks</p>
          <ul className="mt-1 space-y-0.5">
            {tasks.slice(0, 8).map((t, i) => (
              <li key={i} className="truncate text-caption text-ink-subtle">
                {t.number ? `#${t.number} ` : ""}
                {t.title}
                {t.status ? <span className="text-ink-faint"> · {t.status}</span> : null}
              </li>
            ))}
            {tasks.length > 8 && <li className="text-ink-faint text-caption">+{tasks.length - 8} more</li>}
          </ul>
        </div>
      )}
      {risks.length > 0 && <p className="text-caption text-ink-subtle">Risks: {risks.length}</p>}
    </Panel>
  );
}

/**
 * Right-side Assistant panel for one Project, or for the dashboard when `projectId` is null
 * (ADR 0007). A User keeps as many Conversations per scope as they like: the header opens the
 * history list and starts new chats; the active thread mounts its own chat state.
 */
export function AssistantDock({
  projectId,
  conversations,
  thread,
  configured,
}: {
  projectId: string | null;
  /** The User's Conversations in this scope, pinned first then newest. */
  conversations: ConversationSummary[];
  /** The Conversation opened on mount (the latest) with its Messages. */
  thread: AssistantThread;
  configured: boolean;
}) {
  const { assistantOpen, toggleAssistant } = useShell();
  const router = useRouter();
  const [active, setActive] = React.useState<AssistantThread>(thread);
  const [showHistory, setShowHistory] = React.useState(false);
  const [menu, setMenu] = React.useState<{ x: number; y: number; c: ConversationSummary } | null>(null);
  React.useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);

  if (!assistantOpen) return null;

  const activeTitle = conversations.find((c) => c.id === active.conversation.id)?.title ?? "New chat";

  const newChat = async () => {
    setShowHistory(false);
    if (!active.messages.length) return; // already on a fresh chat
    const res = await createConversationAction({ projectId });
    if (!res.ok) return console.error(res.error);
    setActive({ conversation: { id: res.data.id }, messages: [] });
    router.refresh();
  };
  const openChat = async (conversationId: string) => {
    setShowHistory(false);
    if (conversationId === active.conversation.id) return;
    const res = await loadConversationAction({ conversationId });
    if (!res.ok) return console.error(res.error);
    setActive({ conversation: { id: conversationId }, messages: res.data.messages });
  };
  const pin = async (conversationId: string, pinned: boolean) => {
    const res = await pinConversationAction({ conversationId, pinned });
    if (!res.ok) console.error(res.error);
    router.refresh();
  };

  return (
    <aside aria-label="Assistant" className="flex shrink-0 border-l border-hairline bg-surface-1">
      {showHistory && (
        <div className="w-56 shrink-0 overflow-y-auto border-r border-hairline px-2 py-3">
          <p className="px-2 pb-2 text-caption text-ink-subtle">Chats</p>
          <ul className="flex flex-col gap-0.5">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void openChat(c.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, c });
                  }}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left hover:bg-surface-3",
                    c.id === active.conversation.id && "bg-surface-3",
                  )}
                >
                  <span className="flex items-center gap-1.5 truncate text-body-sm text-ink">
                    {c.pinned && <Pin className="size-3 shrink-0 text-primary" />}
                    <span className="truncate">{c.title ?? "New chat"}</span>
                  </span>
                  <span className="text-ink-faint block text-caption">{relative(c.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex w-96 flex-col">
        <div className="flex h-11 items-center gap-1 border-b border-hairline px-4">
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <h2 className="text-body-sm font-medium text-ink">Assistant</h2>
          <span className="text-ink-faint min-w-0 truncate text-caption" title={activeTitle}>
            {activeTitle}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <Button size="icon" variant="ghost" onClick={() => void newChat()} aria-label="New chat">
              <SquarePen className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowHistory((s) => !s)}
              aria-label="Chat history"
              aria-expanded={showHistory}
            >
              <History className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={toggleAssistant} aria-label="Close Assistant">
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
        <ChatPanel
          key={active.conversation.id}
          projectId={projectId}
          conversationId={active.conversation.id}
          initialMessages={active.messages}
          configured={configured}
        />
      </div>
      {menu && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <Panel
            role="menu"
            className="fixed p-1"
            style={{
              top: Math.min(menu.y, window.innerHeight - 60),
              left: Math.min(menu.x, window.innerWidth - 170),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-40 items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink hover:bg-surface-3"
              onClick={() => {
                void pin(menu.c.id, !menu.c.pinned);
                setMenu(null);
              }}
            >
              <Pin className="text-ink-faint size-3.5" />
              {menu.c.pinned ? "Unpin chat" : "Pin chat"}
            </button>
          </Panel>
        </div>
      )}
    </aside>
  );
}

/** One Conversation's chat state: messages, streaming, approvals, composer. */
function ChatPanel({
  projectId,
  conversationId,
  initialMessages,
  configured,
}: {
  projectId: string | null;
  conversationId: string;
  initialMessages: UIMessage[];
  configured: boolean;
}) {
  const router = useRouter();
  const [input, setInput] = React.useState("");
  const { messages, sendMessage, addToolApprovalResponse, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/assistant/chat", body: { conversationId } }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message }) => {
      const createdId = message.parts
        .filter((p) => isToolUIPart(p) && getToolName(p) === "create_project" && p.state === "output-available")
        .map((p) => (p as { output?: { id?: unknown } }).output?.id)
        .findLast((id) => typeof id === "string");
      if (createdId) router.push(`/projects/${createdId}`);
      else router.refresh();
    },
  });
  const busy = status === "submitted" || status === "streaming";
  // A confirm card must be answered before the next message; a refresh brings the card back.
  const pendingCard = messages.at(-1)?.parts.some(isPendingCard) ?? false;
  const bottom = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || pendingCard) return;
    void sendMessage({ text });
    setInput("");
  };
  // Grant first so the resumed turn (auto-sent on response) already sees the permission.
  const alwaysAllow = async (approvalId: string, toolName: string) => {
    const res = await grantToolPermissionAction({ projectId, toolName });
    if (!res.ok) console.error(res.error);
    router.refresh();
    void addToolApprovalResponse({ id: approvalId, approved: true });
  };
  const notice = !configured ? FRIENDLY[ASSISTANT_NOT_CONFIGURED] : error ? friendly(error) : null;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !notice && (
          <p className="py-6 text-center text-caption text-ink-subtle">
            {projectId
              ? "Ask for a plan, a summary, or a change. Try “plan a two-month launch with UAT in week 6”."
              : "Start from nothing. Try “create a project called Website Relaunch, key WEB”."}
          </p>
        )}
        <CurrentState messages={messages} />
        <ol className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-body-sm",
                  m.role === "user" ? "bg-surface-3 text-ink" : "text-ink-muted",
                )}
              >
                {m.parts.map((part, i) => (
                  <Part
                    key={i}
                    part={part}
                    onAnswer={(id, approved) => void addToolApprovalResponse({ id, approved })}
                    onAlwaysAllow={alwaysAllow}
                  />
                ))}
              </div>
            </li>
          ))}
        </ol>
        {busy && (
          <p role="status" className="mt-3 flex items-center gap-2 text-caption text-ink-subtle">
            <Loader2 className="size-3 animate-spin" /> Working…
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-caption text-ink-subtle">
            {notice}
          </p>
        )}
        <div ref={bottom} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-hairline p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            !configured
              ? "Assistant not configured"
              : pendingCard
                ? "Answer the card above first"
                : "Message the Assistant…"
          }
          disabled={!configured || pendingCard}
          rows={2}
          className="min-h-0 resize-none"
          aria-label="Message"
        />
        <Button
          type="submit"
          size="icon"
          variant="primary"
          disabled={!configured || busy || pendingCard || !input.trim()}
        >
          <ArrowUp className="size-3.5" />
        </Button>
      </form>
    </>
  );
}

function friendly(error: Error) {
  return FRIENDLY[error.message] ?? "Something went wrong. Try again.";
}

function Part({
  part,
  onAnswer,
  onAlwaysAllow,
}: {
  part: UIMessage["parts"][number];
  onAnswer: (approvalId: string, approved: boolean) => void;
  onAlwaysAllow: (approvalId: string, toolName: string) => Promise<void>;
}) {
  if (part.type === "text") return <LinkedText text={part.text} />;
  if (!isToolUIPart(part)) return null;
  return <ToolCall part={part} onAnswer={onAnswer} onAlwaysAllow={onAlwaysAllow} />;
}

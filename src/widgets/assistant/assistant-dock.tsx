"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { ArrowUp, Loader2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useShell } from "@/shared/lib/shell-context";
import { ASSISTANT_LIMIT_REACHED, ASSISTANT_NOT_CONFIGURED } from "@/shared/lib/assistant-errors";
import { cn } from "@/shared/lib/cn";
import { Button, Panel, SectionTitle, Textarea } from "@/shared/ui";
import { LinkedText } from "./linked-text";

const FRIENDLY: Record<string, string> = {
  [ASSISTANT_NOT_CONFIGURED]: "The Assistant is not configured. Set OPENAI_API_KEY to enable it.",
  [ASSISTANT_LIMIT_REACHED]: "You have reached today's Assistant limit. It resets at midnight UTC.",
};

const TOOL_LABEL: Record<string, string> = {
  search_decisions: "Searched decisions",
  get_project_summary: "Read the Project",
  list_tasks: "Listed Tasks",
  get_task: "Read a Task",
  create_task: "Created Task",
  update_task: "Updated Task",
  create_milestone: "Created Milestone",
  update_milestone: "Updated Milestone",
  delete_task: "Deleted Task",
  delete_milestone: "Deleted Milestone",
  update_project: "Updated Project",
  create_risk: "Logged Risk",
  update_risk: "Updated Risk",
  add_comment: "Commented",
  add_dependency: "Added dependency",
  remove_dependency: "Removed dependency",
  list_people: "Listed People",
  create_person: "Added Person",
  list_teams: "Listed Teams",
  list_labels: "Listed Labels",
  create_label: "Created Label",
  set_task_labels: "Tagged Task",
  list_evidence: "Listed Evidence",
  get_evidence: "Read Evidence",
  link_evidence: "Linked Evidence",
  list_projects: "Listed Projects",
  create_project: "Created Project",
};

const isPendingCard = (part: UIMessage["parts"][number]) => isToolUIPart(part) && part.state === "approval-requested";

type ProjectSummary = {
  project?: { name?: string; key?: string } | null;
  milestones?: { name?: string; targetDate?: string }[];
  tasks?: { number?: number; title?: string; status?: string }[];
  risks?: { name?: string }[];
};

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
 * (ADR 0007). The shell owns the open state so header buttons and the command palette can
 * toggle it, and it survives the navigation into a Project the Assistant just created.
 */
export function AssistantDock({
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
  const { assistantOpen, toggleAssistant } = useShell();
  const router = useRouter();
  const [input, setInput] = React.useState("");
  const { messages, sendMessage, addToolApprovalResponse, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/assistant/chat", body: { projectId } }),
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

  if (!assistantOpen) return null;

  const submit = () => {
    const text = input.trim();
    if (!text || busy || pendingCard) return;
    void sendMessage({ text });
    setInput("");
  };
  const notice = !configured ? FRIENDLY[ASSISTANT_NOT_CONFIGURED] : error ? friendly(error) : null;

  return (
    <aside aria-label="Assistant" className="flex w-96 shrink-0 flex-col border-l border-hairline bg-surface-1">
      <div className="flex h-11 items-center gap-2 border-b border-hairline px-4">
        <Sparkles className="size-3.5 text-primary" />
        <h2 className="text-body-sm font-medium text-ink">Assistant</h2>
        <Button size="icon" variant="ghost" className="ml-auto" onClick={toggleAssistant} aria-label="Close Assistant">
          <X className="size-3.5" />
        </Button>
      </div>
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
    </aside>
  );
}

function friendly(error: Error) {
  return FRIENDLY[error.message] ?? "Something went wrong. Try again.";
}

function Part({
  part,
  onAnswer,
}: {
  part: UIMessage["parts"][number];
  onAnswer: (approvalId: string, approved: boolean) => void;
}) {
  if (part.type === "text") return <LinkedText text={part.text} />;
  if (!isToolUIPart(part)) return null;
  if (part.state === "approval-requested") {
    return <ConfirmCard approvalId={part.approval.id} reason={part.approval.requestReason} onAnswer={onAnswer} />;
  }
  const name = getToolName(part);
  const label = TOOL_LABEL[name] ?? name;
  if (part.state === "output-denied" || (part.state === "approval-responded" && !part.approval.approved)) {
    return <p className="my-0.5 text-caption text-ink-subtle">Cancelled: {label.toLowerCase()}</p>;
  }
  const done = part.state === "output-available";
  const failed = part.state === "output-error" || (done && isErrorResult(part.output));
  const target = done ? entityLabel(part.output) : null;
  return (
    <p className="my-0.5 flex items-center gap-1.5 text-caption text-ink-subtle">
      {done || failed ? (
        <span className={cn("size-1.5 rounded-full", failed ? "bg-tag-red" : "bg-tag-green")} />
      ) : (
        <Loader2 className="size-3 animate-spin" />
      )}
      {failed ? `${label} failed` : label}
      {target && <span className="truncate text-ink">{target}</span>}
    </p>
  );
}

const isErrorResult = (v: unknown): v is { error: string } => typeof v === "object" && v !== null && "error" in v;

function entityLabel(v: unknown) {
  if (typeof v !== "object" || v === null) return null;
  const o = v as { title?: string; name?: string; number?: number };
  const text = o.title ?? o.name;
  return text ? (o.number ? `#${o.number} ${text}` : text) : null;
}

/** Destructive or Project-level tool call waiting for the User (ADR 0007). Only Confirm runs it. */
function ConfirmCard({
  approvalId,
  reason,
  onAnswer,
}: {
  approvalId: string;
  reason?: string;
  onAnswer: (approvalId: string, approved: boolean) => void;
}) {
  return (
    <div role="group" aria-label="Confirm" className="my-1 panel border-hairline-strong bg-surface-2 p-3">
      <p className="text-body-sm text-ink">{reason ?? "Confirm this change?"}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" onClick={() => onAnswer(approvalId, false)}>
          Cancel
        </Button>
        <Button size="sm" variant="danger" onClick={() => onAnswer(approvalId, true)}>
          Confirm
        </Button>
      </div>
    </div>
  );
}

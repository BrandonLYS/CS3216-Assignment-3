"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { ArrowUp, Loader2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useShell } from "@/shared/lib/shell-context";
import { ASSISTANT_LIMIT_REACHED, ASSISTANT_NOT_CONFIGURED } from "@/shared/lib/assistant-errors";
import { cn } from "@/shared/lib/cn";
import { Button, Textarea } from "@/shared/ui";

const FRIENDLY: Record<string, string> = {
  [ASSISTANT_NOT_CONFIGURED]: "The Assistant is not configured. Set OPENAI_API_KEY to enable it.",
  [ASSISTANT_LIMIT_REACHED]: "You have reached today's Assistant limit. It resets at midnight UTC.",
};

const TOOL_LABEL: Record<string, string> = {
  get_project_summary: "Read the Project",
  list_tasks: "Listed Tasks",
  get_task: "Read a Task",
  create_task: "Created Task",
  update_task: "Updated Task",
  create_milestone: "Created Milestone",
  update_milestone: "Updated Milestone",
};

/**
 * Right-side Assistant panel for one Project (ADR 0007). Mounted by the Project layout; the
 * shell owns the open state so the header button and the command palette can toggle it.
 */
export function AssistantDock({
  projectId,
  conversationId,
  initialMessages,
  configured,
}: {
  projectId: string;
  conversationId: string;
  initialMessages: UIMessage[];
  configured: boolean;
}) {
  const { assistantOpen, toggleAssistant } = useShell();
  const router = useRouter();
  const [input, setInput] = React.useState("");
  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/assistant/chat", body: { projectId } }),
    onFinish: () => router.refresh(),
  });
  const busy = status === "submitted" || status === "streaming";
  const bottom = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [messages, status]);

  if (!assistantOpen) return null;

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
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
            Ask for a plan, a summary, or a change. Try “plan a two-month launch with UAT in week 6”.
          </p>
        )}
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
                  <Part key={i} part={part} />
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
          placeholder={configured ? "Message the Assistant…" : "Assistant not configured"}
          disabled={!configured}
          rows={2}
          className="min-h-0 resize-none"
          aria-label="Message"
        />
        <Button type="submit" size="icon" variant="primary" disabled={!configured || busy || !input.trim()}>
          <ArrowUp className="size-3.5" />
        </Button>
      </form>
    </aside>
  );
}

function friendly(error: Error) {
  return FRIENDLY[error.message] ?? "Something went wrong. Try again.";
}

function Part({ part }: { part: UIMessage["parts"][number] }) {
  if (part.type === "text") return <p className="whitespace-pre-wrap">{part.text}</p>;
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const done = part.state === "output-available";
  const failed = part.state === "output-error" || (done && isErrorResult(part.output));
  const label = TOOL_LABEL[name] ?? name;
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

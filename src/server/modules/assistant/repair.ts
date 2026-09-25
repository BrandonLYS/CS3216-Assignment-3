import { isToolUIPart, type UIMessage } from "ai";

/**
 * What the model sees for a tool call whose turn died before the call ran: the action never
 * happened, so the safe move is to call the tool again.
 */
const INTERRUPTED =
  "The previous response was interrupted before this tool ran. Nothing was executed; call the tool again to retry.";

/** Tool part states that produce a model `tool-call` with no `tool-result`. */
const INCOMPLETE = new Set(["input-streaming", "input-available", "approval-requested"]);

/**
 * `convertToModelMessages` fails the whole turn with AI_MissingToolResultsError when a persisted
 * tool call never got a result - an aborted stream, a crashed turn, a confirm card the User
 * navigated away from. `approval-responded` parts are left alone: the SDK either records the
 * denial or executes an approved call in this turn. The rest are rewritten to `output-error` so
 * the model sees the interrupted call and redoes it, and the saved thread keeps an honest record
 * instead of a call that spins forever.
 */
export function repairInterruptedToolCalls(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      if (!isToolUIPart(part) || part.providerExecuted || !INCOMPLETE.has(part.state)) return part;
      changed = true;
      const rest = { ...part } as Record<string, unknown>;
      delete rest.approval;
      delete rest.output;
      return { ...rest, state: "output-error", errorText: INTERRUPTED } as UIMessage["parts"][number];
    });
    return changed ? { ...message, parts } : message;
  });
}

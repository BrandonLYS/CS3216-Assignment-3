import type { LanguageModelUsage } from "ai";
import { capture } from "./server";

/**
 * LLM observability in PostHog's `$ai_generation` shape, so its LLM Analytics view computes cost,
 * latency and token totals per model without extra setup. Same data-safety rule as every other
 * event: counts, timings and ids only - `$ai_input` and `$ai_output_choices` are never sent, so no
 * prompt, Evidence text, transcript or answer leaves the server.
 */

/** Which of the three model call sites produced the generation. */
export type AiSpan = "assistant_turn" | "proposal_extraction" | "reflection";

export interface Generation {
  span: AiSpan;
  /** Groups the calls of one Assistant turn, proposal pass or reflection. */
  traceId: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: LanguageModelUsage;
  finishReason?: string;
  error?: unknown;
  /** Bounded, content-free metadata such as `project_id` or `step`. */
  properties?: Record<string, unknown>;
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : "UnknownError");

/** Never throws: telemetry cannot fail a model call or the write around it. */
export async function captureGeneration(userId: string, g: Generation) {
  try {
    await capture(userId, "$ai_generation", {
      ...g.properties,
      $ai_trace_id: g.traceId,
      $ai_span_name: g.span,
      $ai_provider: g.provider,
      $ai_model: g.model,
      $ai_latency: g.latencyMs / 1000,
      $ai_input_tokens: g.usage?.inputTokens,
      $ai_output_tokens: g.usage?.outputTokens,
      $ai_cache_read_input_tokens: g.usage?.inputTokenDetails?.cacheReadTokens,
      $ai_reasoning_tokens: g.usage?.outputTokenDetails?.reasoningTokens,
      finish_reason: g.finishReason,
      $ai_is_error: g.error !== undefined,
      // The class name only: provider messages can echo parts of the prompt.
      ...(g.error !== undefined ? { $ai_error: errorName(g.error) } : {}),
    });
  } catch {
    // `capture` isolates delivery; this covers building the payload.
  }
}

/**
 * Times one non-streaming model call and records it, success or failure. The result is returned
 * or the error rethrown unchanged, so callers keep their own failure handling.
 */
export async function traceGeneration<T extends { usage?: LanguageModelUsage }>(
  userId: string,
  g: Omit<Generation, "latencyMs" | "usage" | "error">,
  run: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await run();
    await captureGeneration(userId, { ...g, latencyMs: performance.now() - started, usage: result.usage });
    return result;
  } catch (error) {
    await captureGeneration(userId, { ...g, latencyMs: performance.now() - started, error });
    throw error;
  }
}

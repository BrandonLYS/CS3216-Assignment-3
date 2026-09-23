import type { LanguageModelUsage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("./server", () => ({ capture: server.capture }));

const usage = {
  inputTokens: 1200,
  outputTokens: 80,
  inputTokenDetails: { cacheReadTokens: 1024 },
  outputTokenDetails: { reasoningTokens: 0 },
} as LanguageModelUsage;

const span = {
  span: "proposal_extraction" as const,
  traceId: "trace-1",
  provider: "openai",
  model: "gpt-4o-mini",
  properties: { project_id: "project-a" },
};

beforeEach(() => {
  vi.resetAllMocks();
  server.capture.mockResolvedValue(undefined);
});

describe("LLM generation telemetry", () => {
  it("records tokens and latency in PostHog's $ai_generation shape, without prompt or output", async () => {
    const { traceGeneration } = await import("./ai");
    const result = await traceGeneration("user-a", span, async () => ({ proposals: [], usage }));
    expect(result).toEqual({ proposals: [], usage });
    const [userId, event, properties] = server.capture.mock.calls[0];
    expect(userId).toBe("user-a");
    expect(event).toBe("$ai_generation");
    expect(properties).toMatchObject({
      project_id: "project-a",
      $ai_trace_id: "trace-1",
      $ai_span_name: "proposal_extraction",
      $ai_provider: "openai",
      $ai_model: "gpt-4o-mini",
      $ai_input_tokens: 1200,
      $ai_output_tokens: 80,
      $ai_cache_read_input_tokens: 1024,
      $ai_is_error: false,
    });
    expect(properties.$ai_latency).toBeGreaterThanOrEqual(0);
    expect(properties).not.toHaveProperty("$ai_input");
    expect(properties).not.toHaveProperty("$ai_output_choices");
    expect(properties).not.toHaveProperty("$ai_error");
  });

  it("records a failed call by error class only and rethrows it unchanged", async () => {
    const { traceGeneration } = await import("./ai");
    const failure = new TypeError("prompt text echoed by the provider");
    await expect(
      traceGeneration("user-a", span, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(server.capture.mock.calls[0][2]).toMatchObject({ $ai_is_error: true, $ai_error: "TypeError" });
    expect(JSON.stringify(server.capture.mock.calls[0][2])).not.toContain("prompt text");
  });

  it("never lets telemetry fail the model call", async () => {
    server.capture.mockRejectedValue(new Error("collector down"));
    const { traceGeneration } = await import("./ai");
    await expect(traceGeneration("user-a", span, async () => ({ usage }))).resolves.toEqual({ usage });
  });
});

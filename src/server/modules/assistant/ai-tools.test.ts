import { simulateReadableStream, stepCountIs, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, expect, it } from "vitest";
import { tasksService } from "@/server/modules/tasks/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { toAiTools } from "./ai-tools";
import { findTool } from "./tools";

afterAll(closeDb);

it("continues a streamed turn after a tool returns database timestamps", async () => {
  const ctx = await makeCtx();
  const project = await makeProject(ctx, "STREAM");
  await tasksService.create(ctx, { projectId: project.id, title: "Verify payment reconciliation", priority: "none" });
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
  const model = new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "tool-call", toolCallId: "list-1", toolName: "list_tasks", input: "{}" },
            { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "answer" },
            { type: "text-delta", id: "answer", delta: "Verify payment reconciliation" },
            { type: "text-end", id: "answer" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
          ],
        }),
      },
    ],
  });
  const errors: unknown[] = [];
  const result = streamText({
    model,
    prompt: "List my Tasks.",
    tools: toAiTools(ctx, [findTool("list_tasks")], { projectId: project.id }),
    stopWhen: stepCountIs(2),
    onError: ({ error }) => {
      errors.push(error);
    },
  });
  const parts = [];
  for await (const part of result.stream) parts.push(part);
  expect(errors.map((error) => (error instanceof Error ? error.message : error))).toEqual([]);
  expect(model.doStreamCalls).toHaveLength(2);
  expect(model.doStreamCalls[1].prompt).toContainEqual({
    role: "tool",
    content: [
      expect.objectContaining({
        type: "tool-result",
        toolName: "list_tasks",
        output: {
          type: "json",
          value: [
            expect.objectContaining({
              task: expect.objectContaining({
                title: "Verify payment reconciliation",
                createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
              }),
            }),
          ],
        },
      }),
    ],
  });
  expect(parts).toContainEqual(expect.objectContaining({ type: "text-delta", text: "Verify payment reconciliation" }));
});

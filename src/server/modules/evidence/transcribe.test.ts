import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/core/context";
import type { UploadedFile } from "./service";

const mocks = vi.hoisted(() => ({ generateText: vi.fn(), getModelForUser: vi.fn(), capture: vi.fn() }));
vi.mock("ai", async (original) => ({ ...(await original<typeof import("ai")>()), generateText: mocks.generateText }));
vi.mock("@/server/modules/assistant/model", async (original) => ({
  ...(await original<typeof import("@/server/modules/assistant/model")>()),
  getModelForUser: mocks.getModelForUser,
}));
vi.mock("@/shared/analytics/server", () => ({ capture: mocks.capture }));

const { fileToTextViaModel } = await import("./transcribe");

const ctx = { userId: "user-a" } as Ctx;
const scan: UploadedFile = { name: "scan.png", type: "image/png", size: 3, bytes: Buffer.from([1, 2, 3]) };
// The shape `modelInfo` reads: a User's own model, not the environment default.
const own = { provider: "anthropic.messages", modelId: "claude-haiku-4-5" };
const usage = { inputTokens: 900, outputTokens: 40 };

beforeEach(() => vi.resetAllMocks());

describe("fileToTextViaModel", () => {
  it("transcribes on the User's resolved model and traces it without content", async () => {
    mocks.getModelForUser.mockResolvedValue(own);
    mocks.generateText.mockResolvedValue({ text: "  Pilot moves to 6 October \n", usage });

    expect(await fileToTextViaModel(ctx, "project-a", scan)).toBe("Pilot moves to 6 October");
    expect(mocks.generateText.mock.calls[0][0].model).toBe(own);
    const [userId, event, properties] = mocks.capture.mock.calls[0];
    expect([userId, event]).toEqual(["user-a", "$ai_generation"]);
    expect(properties).toMatchObject({
      $ai_span_name: "scan_transcription",
      $ai_provider: "anthropic",
      $ai_model: "claude-haiku-4-5",
      project_id: "project-a",
      $ai_is_error: false,
    });
    expect(JSON.stringify(properties)).not.toContain("Pilot");
  });

  it("returns null without a call when no model is configured", async () => {
    mocks.getModelForUser.mockResolvedValue(null);
    expect(await fileToTextViaModel(ctx, "project-a", scan)).toBeNull();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("returns null and records the failure when the model rejects the file", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getModelForUser.mockResolvedValue(own);
    mocks.generateText.mockRejectedValue(new TypeError("image parts are not supported"));

    expect(await fileToTextViaModel(ctx, "project-a", scan)).toBeNull();
    expect(mocks.capture.mock.calls[0][2]).toMatchObject({ $ai_is_error: true, $ai_error: "TypeError" });
  });
});

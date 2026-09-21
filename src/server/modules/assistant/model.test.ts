import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/core/context";
import { aiConfigService } from "@/server/modules/ai-config/service";
import { userAiConfigs } from "@/server/modules/ai-config/schema";
import { closeDb, makeCtx } from "@/test/helpers";
import { getModel } from "./model";

let ctx: Ctx;
const encryptionKey = Buffer.alloc(32, 3).toString("base64");
const details = (model: Awaited<ReturnType<typeof getModel>>) => {
  if (!model || typeof model === "string") return model;
  return { provider: model.provider, modelId: model.modelId };
};

beforeAll(async () => {
  ctx = await makeCtx();
});
beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("AI_CREDENTIALS_ENCRYPTION_KEY", encryptionKey);
  await aiConfigService.remove(ctx);
});
afterAll(closeDb);

describe("getModel", () => {
  it("resolves all environment providers and rejects unsupported or incomplete settings", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("AI_MODEL", "gpt-env");
    expect(details(await getModel(ctx))).toMatchObject({ provider: "openai.responses", modelId: "gpt-env" });

    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key");
    vi.stubEnv("AI_MODEL", "claude-env");
    expect(details(await getModel(ctx))).toMatchObject({ provider: "anthropic.messages", modelId: "claude-env" });

    vi.stubEnv("AI_PROVIDER", "openai_compatible");
    vi.stubEnv("AI_API_KEY", "compatible-key");
    vi.stubEnv("AI_BASE_URL", "https://api.example.test/v1");
    vi.stubEnv("AI_MODEL", "custom-env");
    expect(details(await getModel(ctx))).toMatchObject({
      provider: "user-openai-compatible.chat",
      modelId: "custom-env",
    });

    vi.stubEnv("AI_PROVIDER", "google");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "google-key");
    vi.stubEnv("AI_MODEL", "gemini-3.8-flash");
    expect(details(await getModel(ctx))).toMatchObject({
      provider: "google.generative-ai",
      modelId: "gemini-3.8-flash",
    });

    vi.stubEnv("AI_PROVIDER", "unsupported");
    expect(await getModel(ctx)).toBeNull();
  });

  it("prefers personal configuration and restores the environment fallback after removal", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "environment-key");
    vi.stubEnv("AI_MODEL", "environment-model");
    await aiConfigService.save(
      ctx,
      { provider: "anthropic", model: "personal-model", apiKey: "personal-key" },
      async () => {},
    );
    expect(details(await getModel(ctx))).toMatchObject({ provider: "anthropic.messages", modelId: "personal-model" });
    await aiConfigService.remove(ctx);
    expect(details(await getModel(ctx))).toMatchObject({ provider: "openai.responses", modelId: "environment-model" });
  });

  it("fails closed when a personal credential is corrupted", async () => {
    await ctx.db.insert(userAiConfigs).values({
      userId: ctx.userId,
      provider: "openai",
      model: "personal-model",
      encryptedApiKey: "v1.corrupt.value.tag",
    });
    vi.stubEnv("OPENAI_API_KEY", "environment-key");
    await expect(getModel(ctx)).rejects.toThrow();
  });
});

import { generateText, type LanguageModel } from "ai";
import { eq } from "drizzle-orm";
import type { Ctx } from "@/server/core/context";
import { ValidationError } from "@/server/core/errors";
import { buildModel } from "@/server/modules/assistant/model";
import type { AiProvider } from "@/shared/domain";
import { decryptApiKey, encryptApiKey } from "./crypto";
import { guardedFetch, normalizePublicHttpsUrl } from "./endpoint";
import { userAiConfigs } from "./schema";

export interface SaveAiConfig {
  provider: AiProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface AiConfigSummary {
  provider: AiProvider;
  model: string;
  baseUrl: string | null;
  hasApiKey: true;
}

export type DiscoverAiModels = Pick<SaveAiConfig, "provider" | "baseUrl" | "apiKey">;

type Validate = (model: LanguageModel) => Promise<void>;
const validate: Validate = async (model) => {
  await generateText({ model, prompt: "Reply OK.", maxOutputTokens: 4, maxRetries: 0, timeout: 10_000 });
};

export const aiConfigService = {
  summary: async (ctx: Ctx): Promise<AiConfigSummary | null> => {
    const [row] = await ctx.db
      .select({ provider: userAiConfigs.provider, model: userAiConfigs.model, baseUrl: userAiConfigs.baseUrl })
      .from(userAiConfigs)
      .where(eq(userAiConfigs.userId, ctx.userId))
      .limit(1);
    return row ? { ...row, hasApiKey: true } : null;
  },

  models: async (ctx: Ctx, input: DiscoverAiModels, fetchImpl: typeof fetch = fetch): Promise<string[]> => {
    const [existing] = await ctx.db.select().from(userAiConfigs).where(eq(userAiConfigs.userId, ctx.userId)).limit(1);
    const suppliedKey = input.apiKey?.trim();
    if (!suppliedKey && existing?.provider !== input.provider)
      throw new ValidationError("Enter an API key before checking available models", {
        apiKey: ["API key is required"],
      });
    const apiKey = suppliedKey || decryptApiKey(existing.encryptedApiKey, ctx.userId);
    let url: string;
    let headers: Record<string, string>;
    let providerFetch = fetchImpl;
    if (input.provider === "openai") {
      url = "https://api.openai.com/v1/models";
      headers = { authorization: `Bearer ${apiKey}` };
    } else if (input.provider === "anthropic") {
      url = "https://api.anthropic.com/v1/models";
      headers = { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    } else if (input.provider === "google") {
      url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
      headers = { "x-goog-api-key": apiKey };
    } else {
      const baseUrl = await normalizePublicHttpsUrl(input.baseUrl?.trim() ?? "");
      url = `${baseUrl}/models`;
      headers = { authorization: `Bearer ${apiKey}` };
      providerFetch = guardedFetch(undefined, fetchImpl, new URL(baseUrl).origin);
    }
    try {
      const response = await providerFetch(url, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok || (response.status >= 300 && response.status < 400))
        throw new Error("Provider rejected request");
      const body = (await response.json()) as {
        data?: Array<{ id?: unknown }>;
        models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }>;
      };
      const values =
        input.provider === "google"
          ? (body.models ?? [])
              .filter(
                (item) =>
                  Array.isArray(item.supportedGenerationMethods) &&
                  item.supportedGenerationMethods.includes("generateContent"),
              )
              .map((item) => (typeof item.name === "string" ? item.name.replace(/^models\//, "") : ""))
          : (body.data ?? []).map((item) => (typeof item.id === "string" ? item.id : ""));
      return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError("Could not load models. Check the provider, endpoint, and API key.");
    }
  },

  save: async (ctx: Ctx, input: SaveAiConfig, validateModel: Validate = validate): Promise<void> => {
    const [existing] = await ctx.db.select().from(userAiConfigs).where(eq(userAiConfigs.userId, ctx.userId)).limit(1);
    const model = input.model.trim();
    if (!model) throw new ValidationError("Please fix the highlighted fields", { model: ["Model is required"] });
    const providerChanged = existing && existing.provider !== input.provider;
    const suppliedKey = input.apiKey?.trim();
    if (!suppliedKey && (!existing || providerChanged))
      throw new ValidationError("An API key is required for a new provider", { apiKey: ["API key is required"] });
    const apiKey = suppliedKey || decryptApiKey(existing!.encryptedApiKey, ctx.userId);
    const baseUrl =
      input.provider === "openai_compatible" ? await normalizePublicHttpsUrl(input.baseUrl?.trim() ?? "") : null;
    const candidate = buildModel({ provider: input.provider, model, baseUrl, apiKey });
    try {
      await validateModel(candidate);
    } catch {
      throw new ValidationError(
        "The provider could not validate this configuration. Check the endpoint, key, and model.",
      );
    }
    const encryptedApiKey = suppliedKey ? encryptApiKey(apiKey, ctx.userId) : existing!.encryptedApiKey;
    await ctx.db
      .insert(userAiConfigs)
      .values({ userId: ctx.userId, provider: input.provider, model, baseUrl, encryptedApiKey })
      .onConflictDoUpdate({
        target: userAiConfigs.userId,
        set: { provider: input.provider, model, baseUrl, encryptedApiKey, updatedAt: new Date() },
      });
  },

  remove: async (ctx: Ctx): Promise<void> => {
    await ctx.db.delete(userAiConfigs).where(eq(userAiConfigs.userId, ctx.userId));
  },
};

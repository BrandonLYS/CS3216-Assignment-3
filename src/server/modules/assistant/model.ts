import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { eq } from "drizzle-orm";
import type { LanguageModel } from "ai";
import type { Ctx } from "@/server/core/context";
import { decryptApiKey } from "@/server/modules/ai-config/crypto";
import { guardedFetch } from "@/server/modules/ai-config/endpoint";
import { userAiConfigs } from "@/server/modules/ai-config/schema";
import type { AiProvider } from "@/shared/domain";

export const DEFAULT_MODEL = "gpt-4o-mini";

const int = (v: string | undefined, fallback: number) => Number(v) || fallback;

/** Env-driven limits; see .env.example. */
export const assistantConfig = () => ({
  maxSteps: int(process.env.ASSISTANT_MAX_STEPS, 8),
  dailyTurnCap: int(process.env.ASSISTANT_DAILY_TURN_CAP, 50),
});

export interface ModelSettings {
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
}

export function buildModel(settings: ModelSettings): LanguageModel {
  if (settings.provider === "openai") return createOpenAI({ apiKey: settings.apiKey })(settings.model);
  if (settings.provider === "anthropic") return createAnthropic({ apiKey: settings.apiKey })(settings.model);
  if (settings.provider === "google") return createGoogleGenerativeAI({ apiKey: settings.apiKey })(settings.model);
  return createOpenAICompatible({
    name: "user-openai-compatible",
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl!,
    fetch: guardedFetch(undefined, undefined, new URL(settings.baseUrl!).origin),
  })(settings.model);
}

function environmentSettings(): ModelSettings | null {
  const provider = process.env.AI_PROVIDER ?? "openai";
  if (provider === "openai")
    return process.env.OPENAI_API_KEY
      ? { provider, apiKey: process.env.OPENAI_API_KEY, model: process.env.AI_MODEL || DEFAULT_MODEL }
      : null;
  if (provider === "anthropic")
    return process.env.ANTHROPIC_API_KEY && process.env.AI_MODEL
      ? { provider, apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.AI_MODEL }
      : null;
  if (provider === "google")
    return process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.AI_MODEL
      ? { provider, apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY, model: process.env.AI_MODEL }
      : null;
  if (provider === "openai_compatible")
    return process.env.AI_API_KEY && process.env.AI_BASE_URL && process.env.AI_MODEL
      ? { provider, apiKey: process.env.AI_API_KEY, baseUrl: process.env.AI_BASE_URL, model: process.env.AI_MODEL }
      : null;
  return null;
}

/** Personal configuration wins. Corrupt credentials fail closed instead of falling back. */
export async function getModel(ctx: Ctx): Promise<LanguageModel | null> {
  const [personal] = await ctx.db.select().from(userAiConfigs).where(eq(userAiConfigs.userId, ctx.userId)).limit(1);
  if (personal)
    return buildModel({
      provider: personal.provider,
      model: personal.model,
      baseUrl: personal.baseUrl,
      apiKey: decryptApiKey(personal.encryptedApiKey, ctx.userId),
    });
  const fallback = environmentSettings();
  return fallback ? buildModel(fallback) : null;
}

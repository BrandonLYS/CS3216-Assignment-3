import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const DEFAULT_MODEL = "gpt-4o-mini";

const int = (v: string | undefined, fallback: number) => Number(v) || fallback;

/** Env-driven limits; see .env.example. */
export const assistantConfig = () => ({
  maxSteps: int(process.env.ASSISTANT_MAX_STEPS, 8),
  dailyTurnCap: int(process.env.ASSISTANT_DAILY_TURN_CAP, 50),
});

/** Provider and model id as analytics reports them; matches what `getModel` builds. */
export const modelInfo = () => ({
  provider: process.env.AI_PROVIDER ?? "openai",
  model: process.env.AI_MODEL || DEFAULT_MODEL,
});

/** The configured chat model, or null so the app boots and the dock can say "not configured". */
export function getModel(): LanguageModel | null {
  const provider = process.env.AI_PROVIDER ?? "openai";
  const apiKey = process.env.OPENAI_API_KEY;
  if (provider !== "openai" || !apiKey) return null;
  return createOpenAI({ apiKey })(process.env.AI_MODEL || DEFAULT_MODEL);
}

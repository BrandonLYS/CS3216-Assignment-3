"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/core/action";
import { AI_PROVIDERS } from "@/shared/domain";
import { aiConfigService } from "@/server/modules/ai-config/service";

interface GoogleModel {
  name: string;
  supportedGenerationMethods?: string[];
}

interface GenericModel {
  id: string;
}

interface CompatibleModel {
  id?: string;
  name?: string;
  architecture?: {
    modality?: string;
  };
}

const schema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
});

export async function saveAiConfigAction(fd: FormData) {
  const result = await runAction(schema, fd, (ctx, input) => aiConfigService.save(ctx, input));
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function removeAiConfigAction() {
  const result = await runAction(z.object({}), new FormData(), (ctx) => aiConfigService.remove(ctx));
  if (result.ok) revalidatePath("/settings");
  return result;
}

const NON_LLM_KEYWORDS = [
  "embedding",
  "embed",
  "whisper",
  "dall-e",
  "tts",
  "speech",
  "audio",
  "moderation",
  "transcribe",
  "realtime",
  "image",
  "babbage",
  "davinci",
];

function isLlmModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !NON_LLM_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export async function discoverAiModelsAction(
  formData: FormData,
): Promise<{ ok: true; data: string[] } | { ok: false; error: string }> {
  try {
    const provider = formData.get("provider") as string;
    const apiKey = formData.get("apiKey") as string;
    const baseUrl = (formData.get("baseUrl") as string) || "";

    if (!provider) {
      return { ok: false, error: "Provider is required." };
    }
    let models: string[] = [];
    switch (provider) {
      case "google": {
        const key =
          apiKey ||
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          process.env.GOOGLE_API_KEY;

        if (!key) return { ok: false, error: "Google API key is required." };

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!res.ok) throw new Error(`Google API error: ${res.statusText}`);
        const data = (await res.json()) as { models?: GoogleModel[] };

        models = (data.models || [])
          .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m) => m.name.replace(/^models\//, ""));
        break;
      }

      case "anthropic": {
        const key = apiKey || process.env.ANTHROPIC_API_KEY;
        if (!key) return { ok: false, error: "Anthropic API key is required." };

        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
        });
        if (!res.ok) throw new Error(`Anthropic API error: ${res.statusText}`);
        const data = (await res.json()) as { data?: GenericModel[] };

        models = (data.data || []).map((m) => m.id).filter(isLlmModel);
        break;
      }

      case "openai": {
        const key = apiKey || process.env.OPENAI_API_KEY;
        if (!key) return { ok: false, error: "OpenAI API key is required." };

        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) throw new Error(`OpenAI API error: ${res.statusText}`);
        const data = (await res.json()) as { data?: GenericModel[] };

        models = (data.data || []).map((m) => m.id).filter(isLlmModel);
        break;
      }

      case "openai_compatible": {
        const url = baseUrl.replace(/\/$/, "");
        if (!url) return { ok: false, error: "Base URL is required for OpenAI-compatible providers." };

        const headers: Record<string, string> = {};
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

        const res = await fetch(`${url}/models`, { headers });
        if (!res.ok) throw new Error(`Endpoint error: ${res.statusText}`);
        const data = (await res.json()) as CompatibleModel[] | { data?: CompatibleModel[] };

        const rawList = Array.isArray(data) ? data : data.data || [];

        models = rawList
          .filter((m) => {
            if (m.architecture?.modality) {
              return m.architecture.modality.includes("text");
            }
            const id = m.id || m.name || "";
            return isLlmModel(id);
          })
          .map((m) => m.id || m.name)
          .filter((id): id is string => Boolean(id));
        break;
      }

      default:
        return { ok: false, error: "Unsupported provider." };
    }

    return { ok: true, data: models };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to discover models.";
    return { ok: false, error: errorMsg };
  }
}

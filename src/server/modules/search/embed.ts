import { createOpenAI } from "@ai-sdk/openai";
import { embedMany, type EmbeddingModel } from "ai";

export const EMBEDDING_DIMS = 1536;
/** Roughly 400-token windows so a chunk stays a citable snippet; overlap keeps context across cuts. */
const CHUNK_CHARS = 1_600;
const CHUNK_OVERLAP = 200;

/** The configured embedding model, or null so search degrades to literal matching. */
export function getEmbeddingModel(): EmbeddingModel | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return createOpenAI({ apiKey }).textEmbeddingModel(process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small");
}

/** Overlapping windows that prefer a newline boundary; deterministic for tests. */
export function chunkText(text: string, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const boundary = clean.lastIndexOf("\n", end);
      if (boundary > start + size / 2) end = boundary;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/** Embeddings for a batch of texts, or null when no model is configured or the call fails. */
export async function embedTexts(values: string[]): Promise<number[][] | null> {
  const model = getEmbeddingModel();
  if (!model || !values.length) return null;
  try {
    const { embeddings } = await embedMany({ model, values });
    return embeddings;
  } catch (e) {
    console.error("[search] embedding failed", e);
    return null;
  }
}

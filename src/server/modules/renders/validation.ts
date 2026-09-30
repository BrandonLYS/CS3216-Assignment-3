import { z } from "zod";
import { requiredText } from "@/server/core/validation";
import { RENDER_EVIDENCE_MAX, RENDER_PROMPT_MAX } from "@/shared/domain";

/** One id or many (repeated form fields), deduped; the service re-checks the cap. */
const evidenceIds = z.preprocess(
  (v) => (v === undefined || v === null || v === "" ? [] : [...new Set(Array.isArray(v) ? v : [v])]),
  z.array(z.string()).max(RENDER_EVIDENCE_MAX, `Choose at most ${RENDER_EVIDENCE_MAX} pieces of Evidence`),
);

export const createRenderSchema = z.object({
  projectId: z.string(),
  prompt: requiredText("Description", RENDER_PROMPT_MAX),
  /** The Evidence the description was drafted from; empty when it was typed by hand. */
  evidenceIds: evidenceIds.optional(),
});

export const renderIdSchema = z.object({ id: z.string() });

export const listRendersSchema = z.object({ projectId: z.string() });

export type CreateRenderInput = z.infer<typeof createRenderSchema>;

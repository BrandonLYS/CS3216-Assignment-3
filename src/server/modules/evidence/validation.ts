import { z } from "zod";
import { optionalDate, optionalText, requiredText } from "@/server/core/validation";
import { EVIDENCE_KINDS, LINKABLE_ENTITY_TYPES } from "@/shared/domain";

export const createEvidenceSchema = z.object({
  projectId: z.string(),
  title: requiredText("Title", 200),
  kind: z.enum(EVIDENCE_KINDS).default("other"),
  sourceDate: optionalDate,
  notes: optionalText,
  body: optionalText,
});

export const updateEvidenceSchema = z.object({
  id: z.string(),
  title: requiredText("Title", 200).optional(),
  kind: z.enum(EVIDENCE_KINDS).optional(),
  sourceDate: optionalDate,
  notes: optionalText,
  body: optionalText,
});

export const evidenceLinkSchema = z.object({
  projectId: z.string(),
  evidenceId: z.string(),
  entityType: z.enum(LINKABLE_ENTITY_TYPES),
  entityId: z.string(),
});

export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
export type UpdateEvidenceInput = z.infer<typeof updateEvidenceSchema>;
export type EvidenceLinkInput = z.infer<typeof evidenceLinkSchema>;

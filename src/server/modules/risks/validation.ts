import { z } from "zod";
import { SCALE_LEVELS } from "@/shared/domain";
import { optionalDate, optionalId, optionalText, requiredText } from "@/server/core/validation";

export const createRiskSchema = z.object({
  projectId: z.string(),
  title: requiredText("Title", 200),
  description: optionalText,
  cause: optionalText,
  impactDescription: optionalText,
  probability: z.enum(SCALE_LEVELS).default("medium"),
  impact: z.enum(SCALE_LEVELS).default("medium"),
  statusId: optionalId,
  ownerId: optionalId,
  mitigation: optionalText,
  reviewDate: optionalDate,
});

export const updateRiskSchema = z.object({
  id: z.string(),
  title: requiredText("Title", 200).optional(),
  description: optionalText,
  cause: optionalText,
  impactDescription: optionalText,
  probability: z.enum(SCALE_LEVELS).optional(),
  impact: z.enum(SCALE_LEVELS).optional(),
  statusId: z.string().optional(),
  ownerId: optionalId,
  mitigation: optionalText,
  reviewDate: optionalDate,
});

export type CreateRiskInput = z.infer<typeof createRiskSchema>;
export type UpdateRiskInput = z.infer<typeof updateRiskSchema>;

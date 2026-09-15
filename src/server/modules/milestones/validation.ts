import { z } from "zod";
import { optionalId, optionalText, requiredDate, requiredText } from "@/server/core/validation";

export const createMilestoneSchema = z.object({
  projectId: z.string(),
  name: requiredText("Name", 160),
  description: optionalText,
  dueDate: requiredDate,
  statusId: optionalId,
  ownerId: optionalId,
});

export const updateMilestoneSchema = z.object({
  id: z.string(),
  name: requiredText("Name", 160).optional(),
  description: optionalText,
  dueDate: requiredDate.optional(),
  statusId: z.string().optional(),
  ownerId: optionalId,
});

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

import { z } from "zod";
import { STATUS_CATEGORIES, STATUS_SCOPES } from "@/shared/domain";
import { hexColor, requiredText } from "@/server/core/validation";

export const createStatusSchema = z.object({
  projectId: z.string(),
  scope: z.enum(STATUS_SCOPES),
  category: z.enum(STATUS_CATEGORIES),
  name: requiredText("Name", 40),
  color: hexColor,
});

export const updateStatusSchema = z.object({
  id: z.string(),
  category: z.enum(STATUS_CATEGORIES).optional(),
  name: requiredText("Name", 40).optional(),
  color: hexColor.optional(),
  isDefault: z.coerce.boolean().optional(),
});

export const reorderStatusesSchema = z.object({
  projectId: z.string(),
  ids: z.array(z.string()).min(1),
});

export type CreateStatusInput = z.infer<typeof createStatusSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

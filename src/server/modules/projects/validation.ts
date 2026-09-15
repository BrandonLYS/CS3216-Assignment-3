import { z } from "zod";
import { HEALTH_LEVELS, PROJECT_STATUSES } from "@/shared/domain";
import { optionalDate, optionalText, requiredText } from "@/server/core/validation";

export const projectKey = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,5}$/, "Key must be 2–6 letters/digits, starting with a letter");

export const createProjectSchema = z.object({
  name: requiredText("Name", 120),
  key: projectKey,
  description: optionalText,
  startDate: optionalDate,
  targetDate: optionalDate,
});

export const updateProjectSchema = z.object({
  id: z.string(),
  name: requiredText("Name", 120).optional(),
  key: projectKey.optional(),
  description: optionalText,
  status: z.enum(PROJECT_STATUSES).optional(),
  health: z.enum(HEALTH_LEVELS).optional(),
  startDate: optionalDate,
  targetDate: optionalDate,
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

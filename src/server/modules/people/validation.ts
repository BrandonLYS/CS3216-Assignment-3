import { z } from "zod";
import { optionalId, optionalText, requiredText } from "@/server/core/validation";

export const createPersonSchema = z.object({
  projectId: z.string(),
  name: requiredText("Name", 120),
  role: optionalText,
  email: optionalText,
  teamId: optionalId,
});

export const updatePersonSchema = z.object({
  id: z.string(),
  name: requiredText("Name", 120).optional(),
  role: optionalText,
  email: optionalText,
  teamId: optionalId,
});

export const createTeamSchema = z.object({
  projectId: z.string(),
  name: requiredText("Name", 120),
  description: optionalText,
});

export const updateTeamSchema = z.object({
  id: z.string(),
  name: requiredText("Name", 120).optional(),
  description: optionalText,
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

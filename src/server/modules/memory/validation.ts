import { z } from "zod";
import { MEMORY_AUTHORS } from "@/shared/domain";

export const saveMemorySchema = z.object({
  /** Null for the Profile; a Project id for that Project's Working Memory. */
  projectId: z.string().nullable(),
  body: z.string(),
  author: z.enum(MEMORY_AUTHORS).default("user"),
  conversationId: z.string().optional(),
  throughMessageId: z.string().optional(),
});
export type SaveMemoryInput = z.infer<typeof saveMemorySchema>;

import { z } from "zod";
import { HISTORY_ENTITY_TYPES } from "@/shared/domain";

export const listEntityHistorySchema = z.object({
  projectId: z.string(),
  entityType: z.enum(HISTORY_ENTITY_TYPES),
  entityId: z.string(),
});
export type ListEntityHistoryInput = z.infer<typeof listEntityHistorySchema>;

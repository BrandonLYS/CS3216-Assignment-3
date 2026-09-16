import { z } from "zod";
import { COMMENT_MAX_LENGTH, COMMENTABLE_ENTITY_TYPES } from "@/shared/domain";
import { optionalDate, optionalId } from "@/server/core/validation";

const body = z
  .string()
  .trim()
  .min(1, "Comment is required")
  .max(COMMENT_MAX_LENGTH, "Comment is too long (max 4,000 characters)");

export const createCommentSchema = z.object({
  projectId: z.string(),
  entityType: z.enum(COMMENTABLE_ENTITY_TYPES),
  entityId: z.string(),
  body,
  saidById: optionalId,
  saidOn: optionalDate,
});

export const listCommentsSchema = z.object({
  projectId: z.string(),
  entityType: z.enum(COMMENTABLE_ENTITY_TYPES),
  entityId: z.string(),
});

export const deleteCommentSchema = z.object({ id: z.string() });

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type ListCommentsInput = z.infer<typeof listCommentsSchema>;

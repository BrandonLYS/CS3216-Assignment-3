import { z } from "zod";

/**
 * No maximum length here: the 4,000-character cap is issue #57, and defining it in two
 * places is how the two come to disagree. Emptiness is rejected by the service as well,
 * so a caller that bypasses this schema gets the same answer.
 */
export const postMessageSchema = z.object({
  projectId: z.string(),
  roomId: z.string(),
  text: z.string().trim().min(1, "Message is required"),
});

export type PostMessageInput = z.infer<typeof postMessageSchema>;

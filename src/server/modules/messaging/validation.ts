import { z } from "zod";
import { ROOM_TYPES } from "@/shared/domain";

/**
 * A checkbox list submits the field once per Person and a single select submits it once, so
 * `formToObject` hands this an array in the first case and a bare string in the second.
 */
const personIds = z.preprocess(
  (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.string()).min(1, "Choose who is in this room"),
);

export const createRoomSchema = z.object({
  projectId: z.string(),
  type: z.enum(ROOM_TYPES),
  // Empty for a one-to-one Room, which is named by its Person; the service rejects the
  // mismatched combinations, because `rooms.name` is nullable for both types.
  name: z.string().trim().optional(),
  personIds,
});

export const addParticipantSchema = z.object({
  projectId: z.string(),
  roomId: z.string(),
  personId: z.string().min(1, "Choose a person"),
});

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

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type AddParticipantInput = z.infer<typeof addParticipantSchema>;
export type PostMessageInput = z.infer<typeof postMessageSchema>;

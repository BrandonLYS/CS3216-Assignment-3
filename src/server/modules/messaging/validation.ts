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

/**
 * One page older than the cursor (issue #60). `before` is required: this is the only way to
 * ask for an older page, and the newest page is the route's job, not an action's.
 *
 * `z.date()` rather than an ISO string: React serializes a `Date` across the server-action
 * boundary, and the `createdAt` the pane sends back is one it was handed as a `Date`. It is
 * also the stricter of the two - `z.coerce.date()` would accept any string a caller invented.
 *
 * No `limit`: the page size is `MESSAGE_PAGE_MORE`, and a client that could choose its own
 * would be a knob with no user and one more thing to clamp.
 */
export const olderMessagesSchema = z.object({
  projectId: z.string(),
  roomId: z.string(),
  before: z.object({ createdAt: z.date(), id: z.string() }),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type AddParticipantInput = z.infer<typeof addParticipantSchema>;
export type PostMessageInput = z.infer<typeof postMessageSchema>;
export type OlderMessagesInput = z.infer<typeof olderMessagesSchema>;

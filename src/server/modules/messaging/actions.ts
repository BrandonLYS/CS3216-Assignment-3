"use server";

import type { z } from "zod";
import { runAction, runParticipantAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { messagingService, participantMessagingService } from "./service";
import { addParticipantSchema, createRoomSchema, postMessageSchema } from "./validation";

export async function createRoomAction(input: z.input<typeof createRoomSchema> | FormData) {
  const res = await runAction(createRoomSchema, input, (ctx, i) => messagingService.createRoom(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function addParticipantAction(input: z.input<typeof addParticipantSchema> | FormData) {
  const res = await runAction(addParticipantSchema, input, (ctx, i) => messagingService.addParticipant(ctx, i));
  // `res.data` is null when the Person was already in the Room, so the Project id comes from
  // the input: the page still needs revalidating either way.
  if (res.ok) revalidateProject((input instanceof FormData ? String(input.get("projectId")) : input.projectId)!);
  return res;
}

export async function postMessageAction(input: z.input<typeof postMessageSchema>) {
  const res = await runAction(postMessageSchema, input, (ctx, i) => messagingService.postMessage(ctx, i));
  // Revalidating the Project subtree is what puts the new Chat Message on the page; issue #59
  // replaces this round trip with a live stream.
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

/**
 * The same Chat Message written by the other audience (ADR 0009), and the first caller of
 * `runParticipantAction`. The schema is the PM's: what a Chat Message is does not depend on
 * who writes it, and a second schema is how the two come to disagree.
 *
 * The `projectId` in the input is not trusted - `assertParticipates` checks it against the
 * Person named by the signed cookie, and a mismatch is a `NotFoundError`.
 */
export async function participantPostMessageAction(input: z.input<typeof postMessageSchema>) {
  const res = await runParticipantAction(postMessageSchema, input, (pctx, i) =>
    participantMessagingService.postMessage(pctx, i),
  );
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

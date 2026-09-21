"use server";

import type { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { messagingService } from "./service";
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

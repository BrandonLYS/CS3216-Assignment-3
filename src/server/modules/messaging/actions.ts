"use server";

import type { z } from "zod";
import { runAction, runParticipantAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { MESSAGE_PAGE_MORE } from "@/shared/domain";
import { MESSAGE_CATCH_UP_MAX, messagingService, participantMessagingService } from "./service";
import {
  addParticipantSchema,
  createRoomSchema,
  newerMessagesSchema,
  olderMessagesSchema,
  postMessageSchema,
} from "./validation";

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

/**
 * Read-only: the pane's only way to reach further back than the page the route rendered
 * (issue #60). No revalidation - nothing changed - which is what `searchTasksAction` does too.
 * Each audience enters through the seam it already uses, so a Room the caller is not entitled
 * to answers exactly as it would for their first page.
 */
export async function olderMessagesAction(input: z.input<typeof olderMessagesSchema>) {
  return runAction(olderMessagesSchema, input, (ctx, { projectId, roomId, before }) =>
    messagingService.listMessages(ctx, { projectId, roomId }, { before, limit: MESSAGE_PAGE_MORE }),
  );
}

export async function participantOlderMessagesAction(input: z.input<typeof olderMessagesSchema>) {
  return runParticipantAction(olderMessagesSchema, input, (pctx, { projectId, roomId, before }) =>
    participantMessagingService.listMessages(pctx, { projectId, roomId }, { before, limit: MESSAGE_PAGE_MORE }),
  );
}

/**
 * The other direction, and how an open pane learns what the other side said (issue #59):
 * read-only, unrevalidating, and asked on a timer rather than by a gesture. Each audience
 * enters through its own seam, exactly as the paging pair above does.
 */
export async function newerMessagesAction(input: z.input<typeof newerMessagesSchema>) {
  return runAction(newerMessagesSchema, input, (ctx, { projectId, roomId, after }) =>
    messagingService.messagesSince(ctx, { projectId, roomId }, { after, limit: MESSAGE_CATCH_UP_MAX }),
  );
}

export async function participantNewerMessagesAction(input: z.input<typeof newerMessagesSchema>) {
  return runParticipantAction(newerMessagesSchema, input, (pctx, { projectId, roomId, after }) =>
    participantMessagingService.messagesSince(pctx, { projectId, roomId }, { after, limit: MESSAGE_CATCH_UP_MAX }),
  );
}

"use server";

import type { z } from "zod";
import { clearParticipantCookie, setParticipantCookie } from "@/server/auth/participant-session";
import { runAction, runOpenAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { participantsService } from "./service";
import { acceptInviteSchema, createInviteSchema, participantLoginSchema } from "./validation";

/**
 * The PM's action. Returns the invite URL, which is the only moment the token exists in
 * readable form; the page shows it once, as the API-token panel does.
 */
export async function createInviteAction(input: z.input<typeof createInviteSchema> | FormData) {
  const res = await runAction(createInviteSchema, input, (ctx, i) => participantsService.createInvite(ctx, i));
  if (!res.ok) return res;
  revalidateProject(res.data.projectId);
  return { ...res, data: { url: inviteUrl(res.data.token), expiresAt: res.data.expiresAt } };
}

/**
 * Open by definition: the Person accepting has no session yet, and gets one here.
 * No `redirect()` - the form navigates in `onSuccess`, per AGENTS.md.
 */
export async function acceptInviteAction(input: z.input<typeof acceptInviteSchema> | FormData) {
  return runOpenAction(acceptInviteSchema, input, async (i) => {
    const session = await participantsService.acceptInvite(i);
    await setParticipantCookie(session);
    return session;
  });
}

export async function participantLoginAction(input: z.input<typeof participantLoginSchema> | FormData) {
  return runOpenAction(participantLoginSchema, input, async (i) => {
    const session = await participantsService.login(i);
    await setParticipantCookie(session);
    return session;
  });
}

/** Open, not participant-scoped: an expired or tampered cookie must still be clearable. */
export async function participantSignOutAction() {
  await clearParticipantCookie();
}

/**
 * Built from the origin the app is already configured with, so a copied link works from the
 * machine the PM is on without trusting a request header.
 */
function inviteUrl(token: string) {
  const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/invite/${token}`;
}

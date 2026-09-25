import { cache } from "react";
import { getParticipantSession, type ParticipantSession } from "./participant-session";
import { getSession } from "./session";

/**
 * Who is looking at a page: the PM who owns PrismPM, or a Person with a messaging-only login
 * (ADR 0009). The two layouts under `(app)` choose the chrome from this, and the messages page
 * chooses which service to read through.
 */
export type Viewer =
  | { kind: "user"; user: { id: string; name: string; email: string } }
  | { kind: "participant"; session: ParticipantSession }
  | null;

/** The User wins when both cookies are present: a PM testing the member view still gets PrismPM. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await getSession();
  if (session) {
    const { id, name, email } = session.user;
    return { kind: "user", user: { id, name, email } };
  }
  const participant = await getParticipantSession();
  return participant ? { kind: "participant", session: participant } : null;
});

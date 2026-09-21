import type { Db } from "@/server/db/client";
import type { Via } from "@/shared/domain";

/** Everything a service needs to act on behalf of a signed-in user. */
export interface Ctx {
  db: Db;
  userId: string;
  /** Present when the Assistant or Reflection acts for the User; stamped on every Activity Event. */
  via?: Via;
}

/**
 * The Participant's counterpart to `Ctx` (ADR 0009). Deliberately a separate type: `Ctx.userId`
 * is a `user.id`, and a Person id passed through it would be handed to `assertOwnsProject`,
 * which is the one seam that must never see one.
 */
export interface ParticipantCtx {
  db: Db;
  person: { id: string; projectId: string };
}

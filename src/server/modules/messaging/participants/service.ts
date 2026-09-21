import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { ParticipantSession } from "@/server/auth/participant-session";
import type { Ctx } from "@/server/core/context";
import { ValidationError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import { db } from "@/server/db/client";
import { peopleRepo } from "@/server/modules/people/repository";
import { assertPersonInProject } from "@/server/modules/people/service";
import { projectsRepo } from "@/server/modules/projects/repository";
import { assertOwnsProject } from "@/server/modules/projects/service";
import type { AcceptInviteInput, CreateInviteInput, ParticipantLoginInput } from "./validation";

/** Same scheme as a personal access token: random bytes handed out once, only the hash stored. */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const INVITE_TTL_DAYS = 7;

/**
 * Said for a token that is unknown, expired or already spent, and for every failed sign-in.
 * One message per surface, so probing tells a stranger nothing.
 */
const INVITE_INVALID = "This invite link is no longer valid";
const LOGIN_INVALID = "Incorrect email or password";

/** The email of a second invited Person collides with `people_project_email_uq`. */
const isEmailConflict = (e: unknown) =>
  typeof e === "object" &&
  e !== null &&
  "cause" in e &&
  (e.cause as { constraint_name?: string } | undefined)?.constraint_name === "people_project_email_uq";

/**
 * The messaging login (ADR 0009). A Participant is a Person with credentials on their own row,
 * never a `user`, so none of this touches better-auth beyond borrowing its scrypt helpers.
 *
 * Only `createInvite` is a PM action and therefore the only one that goes through `mutate`.
 * The Person's own writes record no Activity Event: `activity_events.actor_id` is a foreign key
 * to `user.id`, so there is no honest actor to name, and a credential is not a change to the
 * Project - the same reasoning ADR 0007 uses for the Assistant's documents.
 */
export const participantsService = {
  /** Returns the plaintext token exactly once; only its hash is stored. */
  createInvite: (ctx: Ctx, { projectId, personId }: CreateInviteInput) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, projectId);
      // `assertOwnsProject` only proves the PM owns the Project they named. Without this, an
      // update by `personId` alone would mint a credential on any Person row anywhere.
      await assertPersonInProject(tx, projectId, personId, "personId");
      const person = (await peopleRepo.findById(tx, personId))!;
      if (!person.email) {
        throw new ValidationError("This person needs an email address to sign in", {
          personId: ["No email address"],
        });
      }
      if (await peopleRepo.emailTakenByOther(tx, projectId, person.email, personId)) {
        throw new ValidationError("Another person in this project already signs in with that email", {
          personId: ["Email already in use"],
        });
      }
      const token = randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      try {
        await peopleRepo.setInvite(tx, personId, hashToken(token), expiresAt);
      } catch (e) {
        // The check above races; the partial unique index is the actual guarantee.
        if (isEmailConflict(e)) {
          throw new ValidationError("Another person in this project already signs in with that email", {
            personId: ["Email already in use"],
          });
        }
        throw e;
      }
      // Hand-built, never `diffFields`: the real diff of this row is the token hash itself.
      // `messaging_invite` and not `messagingInvite` because `labelFor` only splits on "_".
      rec.updated("person", projectId, personId, person.name, [
        { field: "messaging_invite", oldValue: null, newValue: "sent" },
      ]);
      return { token, expiresAt, projectId, personId };
    }),

  /** Sets the Person's own password and burns the token. Returns the session to sign them in with. */
  acceptInvite: async ({ token, password }: AcceptInviteInput): Promise<Omit<ParticipantSession, "exp">> => {
    const person = await peopleRepo.acceptInvite(db, hashToken(token), await hashPassword(password));
    if (!person) throw new ValidationError(INVITE_INVALID, { token: ["Invalid"] });
    return { personId: person.id, projectId: person.projectId };
  },

  login: async ({ projectId, email, password }: ParticipantLoginInput): Promise<Omit<ParticipantSession, "exp">> => {
    const person = await peopleRepo.findCredentialsByEmail(db, projectId, email);
    // An unknown address and a Person holding only an invite answer before scrypt runs, so the
    // response time still distinguishes them. Accepted, with the missing rate limiter (ADR 0009).
    if (!person?.passwordHash) throw new ValidationError(LOGIN_INVALID, { password: ["Invalid"] });
    if (!(await verifyPassword({ hash: person.passwordHash, password }))) {
      throw new ValidationError(LOGIN_INVALID, { password: ["Invalid"] });
    }
    return { personId: person.id, projectId: person.projectId };
  },

  /**
   * What the messaging login page may tell an anonymous visitor about a Project: its name, and
   * nothing else. The decision about that lives here rather than in the page, so the route
   * never reaches for a repository itself.
   */
  loginContext: (projectId: string) => projectsRepo.findName(db, projectId),

  /**
   * The Person a cookie still names, or null when they have been deleted or moved to another
   * Project since it was signed. The cookie carries no credential version (ADR 0009), so this
   * is what keeps a stale session from being treated as a live one.
   */
  sessionPerson: async ({ personId, projectId }: Omit<ParticipantSession, "exp">) => {
    const person = await peopleRepo.findById(db, personId);
    return person && person.projectId === projectId ? person : null;
  },

  /**
   * Who a live invite belongs to and which Project it is for, so the accept page can say both.
   * `null` rather than an error, because the page renders "this link is no longer valid" itself.
   */
  invitee: async (token: string) => {
    const person = await peopleRepo.findLiveInvitee(db, hashToken(token));
    if (!person) return null;
    const project = await projectsRepo.findName(db, person.projectId);
    return project ? { person, project } : null;
  },
};

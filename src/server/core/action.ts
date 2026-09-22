import { z } from "zod";
import { db } from "@/server/db/client";
import { getParticipantSession } from "@/server/auth/participant-session";
import { requireUser } from "@/server/auth/session";
import type { Ctx, ParticipantCtx } from "./context";
import { DomainError, ForbiddenError, ValidationError } from "./errors";
import { formToObject } from "./validation";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function ctxForCurrentUser(): Promise<Ctx> {
  const user = await requireUser();
  return { db, userId: user.id };
}

/**
 * Validate input and map domain errors to a result. The three wrappers below differ only in
 * who the caller is; everything else about a server action is here.
 * Redirect/notFound thrown by Next propagate untouched.
 */
async function runValidated<S extends z.ZodType, T>(
  schema: S,
  raw: FormData | unknown,
  fn: (input: z.infer<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(raw instanceof FormData ? formToObject(raw) : raw);
  if (!parsed.success) {
    const { fieldErrors, formErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      error: formErrors[0] ?? "Please fix the highlighted fields",
      fieldErrors: fieldErrors as Record<string, string[]>,
    };
  }
  try {
    return { ok: true, data: await fn(parsed.data) };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Wraps a server action taken by the signed-in User. */
export function runAction<S extends z.ZodType, T>(
  schema: S,
  raw: FormData | unknown,
  fn: (ctx: Ctx, input: z.infer<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  return runValidated(schema, raw, async (input) => fn(await ctxForCurrentUser(), input));
}

/**
 * For the few actions whose caller has no session by definition: the messaging login, accepting
 * an invite, and signing a Participant out (a cookie must be clearable even when it no longer
 * verifies). Every one of these authenticates for itself, and none is project-scoped.
 */
export function runOpenAction<S extends z.ZodType, T>(
  schema: S,
  raw: FormData | unknown,
  fn: (input: z.infer<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  return runValidated(schema, raw, fn);
}

/**
 * Wraps a server action taken by a signed-in Participant (ADR 0009). The `ParticipantCtx` it
 * builds is trusted only as far as the cookie: every service behind it starts with
 * `assertParticipates`, which re-reads the Person.
 */
export function runParticipantAction<S extends z.ZodType, T>(
  schema: S,
  raw: FormData | unknown,
  fn: (pctx: ParticipantCtx, input: z.infer<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  return runValidated(schema, raw, async (input) => {
    const session = await getParticipantSession();
    if (!session) throw new ForbiddenError("Sign in to continue");
    return fn({ db, person: { id: session.personId, projectId: session.projectId } }, input);
  });
}

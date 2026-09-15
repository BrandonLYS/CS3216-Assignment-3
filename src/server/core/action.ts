import { z } from "zod";
import { db } from "@/server/db/client";
import { requireUser } from "@/server/auth/session";
import type { Ctx } from "./context";
import { DomainError, ValidationError } from "./errors";
import { formToObject } from "./validation";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function ctxForCurrentUser(): Promise<Ctx> {
  const user = await requireUser();
  return { db, userId: user.id };
}

/**
 * Wraps a server action: builds the Ctx, validates input, maps domain errors to a result.
 * Redirect/notFound thrown by Next propagate untouched.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  raw: FormData | unknown,
  fn: (ctx: Ctx, input: z.infer<S>) => Promise<T>,
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
    const ctx = await ctxForCurrentUser();
    return { ok: true, data: await fn(ctx, parsed.data) };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

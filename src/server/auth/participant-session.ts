import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * The messaging login's session (ADR 0009). Deliberately not better-auth: `session.userId` is a
 * foreign key to `user`, and a Participant must never hold a `user` row.
 *
 * `projectId` travels inside the signed payload because credentials are per Project, so one
 * cookie names exactly one Project and the reader never has to trust a Project id from the URL.
 */
export interface ParticipantSession {
  personId: string;
  projectId: string;
  /** Unix seconds. */
  exp: number;
}

export const PARTICIPANT_COOKIE = "vantage_participant";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The same secret better-auth signs with. Rotating it signs every Participant out, which is the
 * accepted cost of not introducing a second secret to configure (ADR 0009).
 */
function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is required to sign a participant session");
  return value;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** `<payload>.<signature>`, both base64url, so the value is cookie-safe without escaping. */
export function signParticipantCookie(session: Omit<ParticipantSession, "exp">): {
  value: string;
  maxAge: number;
  session: ParticipantSession;
} {
  const full: ParticipantSession = { ...session, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS };
  const payload = Buffer.from(JSON.stringify(full)).toString("base64url");
  return { value: `${payload}.${sign(payload)}`, maxAge: MAX_AGE_SECONDS, session: full };
}

/**
 * Null for anything that is not a live, untampered cookie. The expiry is checked here as well as
 * by the browser, because the cookie's lifetime is under the client's control and the signature
 * is not.
 */
export function readParticipantCookie(value: string | undefined): ParticipantSession | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(value.slice(dot + 1));
  // `timingSafeEqual` throws on a length mismatch, so a truncated signature must be rejected first.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<ParticipantSession>;
    if (typeof parsed.personId !== "string" || typeof parsed.projectId !== "string") return null;
    if (typeof parsed.exp !== "number" || parsed.exp <= Date.now() / 1000) return null;
    return { personId: parsed.personId, projectId: parsed.projectId, exp: parsed.exp };
  } catch {
    return null;
  }
}

/**
 * Cookie-only: whether the Person still exists and is still in that Project is `assertParticipates`'
 * business, and it reads the row anyway.
 */
export const getParticipantSession = cache(async (): Promise<ParticipantSession | null> => {
  const jar = await cookies();
  return readParticipantCookie(jar.get(PARTICIPANT_COOKIE)?.value);
});

export async function setParticipantCookie(session: Omit<ParticipantSession, "exp">): Promise<void> {
  const { value, maxAge } = signParticipantCookie(session);
  const jar = await cookies();
  jar.set(PARTICIPANT_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  });
}

export async function clearParticipantCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(PARTICIPANT_COOKIE);
}

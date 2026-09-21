import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { PARTICIPANT_COOKIE } from "@/server/auth/participant-cookie";

/** The landing page renders for both states, so it is never redirected. */
const LANDING = "/";
const AUTH = new Set(["/login", "/signup"]);

/**
 * The Participant surfaces (ADR 0009): accepting an invite and the messaging login. They are
 * always reachable, signed in or not, and the Participant cookie never redirects away from
 * them - the pages themselves send a Participant who is already signed in to their Rooms.
 */
const MEMBER_PREFIXES = ["/invite/", "/m/"];

/** Optimistic redirect only; real authorization happens in the service layer. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  if (pathname === LANDING) return NextResponse.next();
  if (MEMBER_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (AUTH.has(pathname)) {
    // A Participant cookie deliberately does not count here: `/login` is the PM's form, and
    // a Participant sent off it would land on a page that sends them straight back.
    return hasSession ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next();
  }
  // A Participant reaches `/projects/<id>/messages` through this branch; every other page in
  // the group builds a `Ctx` of its own and redirects them to `/login`.
  const hasParticipant = Boolean(request.cookies.get(PARTICIPANT_COOKIE));
  if (!hasSession && !hasParticipant) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.\\w+$).*)"],
};

import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/** The landing page renders for both states, so it is never redirected. */
const LANDING = "/";
const AUTH = new Set(["/login", "/signup"]);

/** Optimistic redirect only; real authorization happens in the service layer. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  if (pathname === LANDING) return NextResponse.next();
  if (AUTH.has(pathname)) {
    return hasSession ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next();
  }
  if (!hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.\\w+$).*)"],
};

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { PARTICIPANT_COOKIE } from "@/server/auth/participant-cookie";
import { proxy } from "./proxy";

/** better-auth's own cookie name in a development (non-secure) build. */
const USER_COOKIE = "better-auth.session_token";

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(path, "http://localhost:3000"));
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

const destination = (path: string, cookies?: Record<string, string>) => {
  const res = proxy(request(path, cookies));
  return res.headers.get("location");
};

describe("the optimistic redirect", () => {
  it("sends an anonymous visitor to the sign-in form, remembering where they were going", () => {
    expect(destination("/projects/p1/messages")).toBe("http://localhost:3000/login?next=%2Fprojects%2Fp1%2Fmessages");
    // The landing page renders for everyone.
    expect(destination("/")).toBeNull();
  });

  it("lets a signed-in User through and keeps them off the sign-in form", () => {
    const signedIn = { [USER_COOKIE]: "token" };
    expect(destination("/projects/p1/messages", signedIn)).toBeNull();
    expect(destination("/login", signedIn)).toBe("http://localhost:3000/dashboard");
  });

  it("lets a Participant reach the messages route", () => {
    expect(destination("/projects/p1/messages", { [PARTICIPANT_COOKIE]: "signed.value" })).toBeNull();
  });

  it("leaves the sign-in form alone for a Participant, so the two cannot bounce off each other", () => {
    // `/login` redirecting a Participant to `/dashboard`, which redirects them back to
    // `/login`, is an infinite loop. The PM's form simply renders.
    expect(destination("/login", { [PARTICIPANT_COOKIE]: "signed.value" })).toBeNull();
  });

  it("always serves the invite and messaging-login routes, signed in or not", () => {
    for (const path of ["/invite/abc123", "/m/p1/login"]) {
      expect(destination(path)).toBeNull();
      expect(destination(path, { [PARTICIPANT_COOKIE]: "signed.value" })).toBeNull();
      expect(destination(path, { [USER_COOKIE]: "token" })).toBeNull();
    }
  });
});

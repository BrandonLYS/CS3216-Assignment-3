import { beforeAll, describe, expect, it } from "vitest";
import { readParticipantCookie, signParticipantCookie } from "./participant-session";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-long-enough-to-sign-with";
});

const cookie = (personId = "person-1", projectId = "project-1") => signParticipantCookie({ personId, projectId }).value;

describe("a signed Participant cookie", () => {
  it("round-trips the Person and the Project", () => {
    expect(readParticipantCookie(cookie("p1", "proj1"))).toMatchObject({ personId: "p1", projectId: "proj1" });
  });

  it("is rejected when the payload is edited", () => {
    const [, signature] = cookie().split(".");
    const forged = Buffer.from(JSON.stringify({ personId: "someone-else", projectId: "project-1", exp: 9e9 })).toString(
      "base64url",
    );
    expect(readParticipantCookie(`${forged}.${signature}`)).toBeNull();
  });

  it("is rejected when the signature is edited or truncated", () => {
    const [payload, signature] = cookie().split(".");
    // A truncated signature is the case `timingSafeEqual` throws on rather than returning false.
    expect(readParticipantCookie(`${payload}.${signature!.slice(0, 10)}`)).toBeNull();
    expect(readParticipantCookie(`${payload}.${signature!.slice(0, -1)}x`)).toBeNull();
    expect(readParticipantCookie(payload)).toBeNull();
    expect(readParticipantCookie(undefined)).toBeNull();
  });

  it("is rejected once the payload's own expiry has passed", () => {
    const expired = Buffer.from(
      JSON.stringify({ personId: "p1", projectId: "proj1", exp: Math.floor(Date.now() / 1000) - 1 }),
    ).toString("base64url");
    // Signed correctly: the browser may keep sending a cookie past its Max-Age, so the payload
    // carries the expiry the server actually trusts.
    const { value } = signParticipantCookie({ personId: "p1", projectId: "proj1" });
    const signature = value.split(".")[1]!;
    expect(readParticipantCookie(`${expired}.${signature}`)).toBeNull();
  });

  it("still verifies when replayed at another Project, and names the Project it was signed for", () => {
    // The signature says nothing about where the cookie was sent. What refuses the replay is the
    // page's `session.projectId === projectId` check and `assertParticipates`, not the MAC.
    expect(readParticipantCookie(cookie("p1", "proj1"))?.projectId).toBe("proj1");
  });
});

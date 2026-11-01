import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { auth } from "./auth";
import { session, user } from "./schema";
import { getSession, requireUser } from "./session";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

let userId: string;

beforeEach(async () => {
  const response = await auth.api.signUpEmail({
    body: {
      name: "Session regression",
      email: `session-${randomUUID()}@test.local`,
      password: randomUUID(),
    },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  userId = (await response.json()).user.id;
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie).toContain("session_data=");
  request.headers = new Headers({ cookie });
});

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});
afterAll(() => db.$client.end());

describe("server session validation", () => {
  it("accepts an active database session", async () => {
    expect((await requireUser()).id).toBe(userId);
  });

  it("redirects a cached login after its User is removed", async () => {
    await db.delete(user).where(eq(user.id, userId));

    expect(await getSession()).toBeNull();
    await expect(requireUser()).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
  });

  it("redirects a cached login after its session is revoked", async () => {
    await db.delete(session).where(eq(session.userId, userId));

    expect(await getSession()).toBeNull();
    await expect(requireUser()).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
  });
});

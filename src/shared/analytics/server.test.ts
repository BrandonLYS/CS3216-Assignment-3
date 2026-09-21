import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ capture: vi.fn(), flush: vi.fn(), init: vi.fn() }));
const request = vi.hoisted(() => ({ headers: vi.fn(), after: vi.fn(), session: vi.fn() }));
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor() {
      sdk.init();
    }
    capture = sdk.capture;
    flush = sdk.flush;
  },
}));
vi.mock("next/headers", () => ({ headers: request.headers }));
vi.mock("next/server", () => ({ after: request.after }));
vi.mock("@/server/auth/session", () => ({ getSession: request.session }));

const sid = "0195351c-67a7-7b00-8410-85317b184742";

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  request.headers.mockResolvedValue(new Headers({ "X-PostHog-Session-Id": sid, "X-PostHog-Distinct-Id": "user-a" }));
  request.session.mockResolvedValue({ user: { id: "user-a" } });
  sdk.flush.mockResolvedValue(undefined);
});

describe("server capture contract", () => {
  it("uses the authenticated User and originating browser session", async () => {
    const { captureCurrent } = await import("./server");
    await captureCurrent("project_created", { project_id: "project-a" });
    expect(sdk.capture).toHaveBeenCalledWith({
      distinctId: "user-a",
      event: "project_created",
      properties: { project_id: "project-a", $session_id: sid },
    });
    const flush = request.after.mock.calls[0][0];
    await flush();
    expect(sdk.flush).toHaveBeenCalledOnce();
  });

  it.each([
    new Headers(),
    new Headers({ "X-PostHog-Session-Id": "not-a-session", "X-PostHog-Distinct-Id": "user-a" }),
    new Headers({ "X-PostHog-Session-Id": sid, "X-PostHog-Distinct-Id": "user-b" }),
  ])("omits missing, malformed or mismatched browser context", async (headers) => {
    request.headers.mockResolvedValue(headers);
    const { captureCurrent } = await import("./server");
    await captureCurrent("project_created", { $session_id: "fabricated", distinct_id: "forged" });
    expect(sdk.capture).toHaveBeenCalledWith({ distinctId: "user-a", event: "project_created", properties: {} });
  });

  it("captures trusted background work without inventing a browser session", async () => {
    request.headers.mockRejectedValue(new Error("outside request"));
    request.after.mockImplementation(() => {
      throw new Error("outside lifecycle");
    });
    const { capture } = await import("./server");
    await capture("user-a", "background_completed");
    expect(sdk.capture).toHaveBeenCalledWith({ distinctId: "user-a", event: "background_completed", properties: {} });
    expect(sdk.flush).toHaveBeenCalledOnce();
  });

  it.each(["init", "capture", "flush", "session", "after"])("isolates %s failures from the caller", async (failure) => {
    if (failure === "session") request.session.mockRejectedValue(new Error("unavailable"));
    else if (failure === "after")
      request.after.mockImplementation(() => {
        throw new Error("unavailable");
      });
    else
      sdk[failure as "init" | "capture" | "flush"].mockImplementation(() => {
        throw new Error("unavailable");
      });
    const { captureCurrent } = await import("./server");
    await expect(captureCurrent("project_created")).resolves.toBeUndefined();
    if (request.after.mock.calls.length && failure !== "after")
      await expect(request.after.mock.calls[0][0]()).resolves.toBeUndefined();
  });

  it("does nothing when unconfigured or no User is authenticated", async () => {
    const { captureCurrent } = await import("./server");
    request.session.mockResolvedValue(null);
    await captureCurrent("project_created");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    await captureCurrent("project_created");
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });
});

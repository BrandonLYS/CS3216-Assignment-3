import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { gunzipSync } from "node:zlib";
import { writeFile } from "node:fs/promises";

// This suite needs its own app process with the fake key and collector host.
test.skip(!process.env.ANALYTICS_E2E, "Run with playwright.analytics.config.ts and ANALYTICS_E2E=1");

type Event = {
  event: string;
  distinct_id?: string;
  timestamp: string;
  properties: Record<string, unknown>;
};
const events: Event[] = [];
let collector: Server;
let unavailable = false;
const root = "docs/artifacts/73-analytics-identity";
const password = "analytics-test-123";
const id = (event: Event) => event.distinct_id ?? event.properties.distinct_id;
const session = (event: Event) => event.properties.$session_id;

// Real browser and server SDKs; only the external ingestion endpoint is replaced.
test.beforeAll(async () => {
  collector = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") return res.end();
    if (unavailable) {
      res.statusCode = 503;
      return res.end();
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let data = Buffer.concat(chunks);
    if (data[0] === 31 && data[1] === 139) data = gunzipSync(data);
    if (data.length) {
      const text = data.toString();
      const body = JSON.parse(
        text.startsWith("{") || text.startsWith("[")
          ? text
          : Buffer.from(new URLSearchParams(text).get("data") ?? text, "base64").toString(),
      );
      events.push(...(Array.isArray(body) ? body : (body.batch ?? (body.event ? [body] : []))));
    }
    if (req.url?.includes("config.js")) {
      res.setHeader("Content-Type", "application/javascript");
      return res.end(
        "window._POSTHOG_REMOTE_CONFIG={phc_local_analytics:{config:{hasFeatureFlags:false,supportedCompression:[]}}};",
      );
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: 1, featureFlags: {}, supportedCompression: [], hasFeatureFlags: false }));
  });
  await new Promise<void>((resolve) => collector.listen(3101, resolve));
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => collector.close((error) => (error ? reject(error) : resolve())));
});
test.beforeEach(async ({ context }) => {
  events.length = 0;
  unavailable = false;
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
  });
});

async function signup(page: Page) {
  const email = `analytics-${crypto.randomUUID()}@test.local`;
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Analytics Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const response = page.waitForResponse((res) => res.url().includes("/sign-up/email"));
  await page.getByRole("button", { name: "Create account" }).click();
  const { user } = await (await response).json();
  await expect(page).toHaveURL("/dashboard");
  return { id: user.id as string, email };
}

async function createProject(page: Page) {
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Analytics Project");
  await page.getByLabel("Key").fill("ANA");
  const request = page.waitForRequest((req) => req.method() === "POST" && !!req.headers()["next-action"]);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return request;
}

async function captured(name: string, userId?: string, since = 0) {
  await expect
    .poll(() => events.slice(since).some((event) => event.event === name && (!userId || id(event) === userId)))
    .toBe(true);
  return events.slice(since).findLast((event) => event.event === name && (!userId || id(event) === userId))!;
}

test("landing, signup, Project creation, restoration, logout and returning/switching Users", async ({ page }) => {
  test.skip(!!process.env.ANALYTICS_DISABLED);
  await page.goto("/");
  const landing = await captured("$pageview");
  await page
    .getByRole("link", { name: /get started|start building|start free|sign up/i })
    .first()
    .click();
  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect
    .poll(() => events.findLast((event) => event.event === "$pageview")?.properties.$current_url)
    .toBe("/signup");
  await page.screenshot({ path: `${root}/screenshots/after-analytics-signup.png`, animations: "disabled" });
  const user = await signup(page);
  const signupEvent = await captured("signup_completed", user.id);
  expect(session(signupEvent)).toBe(session(landing));
  const identified = await captured("$identify", user.id);
  expect(identified.properties.$anon_distinct_id).toBe(id(landing));
  expect(identified.timestamp <= signupEvent.timestamp).toBe(true);
  const request = await createProject(page);
  const created = await captured("project_created", user.id);
  expect(session(created)).toBe(session(signupEvent));
  expect(request.headers()["x-posthog-session-id"]).toBe(session(created));
  expect(signupEvent.timestamp <= created.timestamp).toBe(true);
  expect(events.filter((event) => event.event === "signup_completed")).toHaveLength(1);
  await expect(page.getByRole("heading", { name: "Analytics Project" })).toBeVisible();
  await page.screenshot({ path: `${root}/screenshots/after-analytics-project.png`, animations: "disabled" });
  const projectUrl = new URL(page.url()).pathname;
  await expect
    .poll(() =>
      events.some(
        (event) => event.event === "$pageview" && event.properties.$current_url === projectUrl && id(event) === user.id,
      ),
    )
    .toBe(true);
  const reloadStart = events.length;
  await page.reload();
  await expect
    .poll(() =>
      events
        .slice(reloadStart)
        .some(
          (event) =>
            event.event === "$pageview" &&
            event.properties.$current_url === projectUrl &&
            id(event) === user.id &&
            session(event) === session(created),
        ),
    )
    .toBe(true);
  const navigationStart = events.length;
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect
    .poll(() =>
      events
        .slice(navigationStart)
        .some(
          (event) =>
            event.event === "$pageview" &&
            event.properties.$current_url === "/dashboard" &&
            id(event) === user.id &&
            session(event) === session(created),
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await expect
    .poll(() => events.findLast((event) => event.event === "$pageview")?.properties.$current_url)
    .toBe("/login");
  expect(id(events.findLast((event) => event.event === "$pageview")!)).not.toBe(user.id);
  expect(session(events.findLast((event) => event.event === "$pageview")!)).not.toBe(session(created));
  const loginPageview = events.findLast((event) => event.event === "$pageview")!;
  const signInStart = events.length;
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard");
  const returning = await captured("$identify", user.id, signInStart);
  expect(returning.properties.$anon_distinct_id).toBe(id(loginPageview));
  expect(session(returning)).toBe(session(loginPageview));
  await expect
    .poll(() =>
      events
        .slice(signInStart)
        .some(
          (event) =>
            event.event === "$pageview" &&
            event.properties.$current_url === "/dashboard" &&
            id(event) === user.id &&
            session(event) === session(returning),
        ),
    )
    .toBe(true);
  expect(events.filter((event) => event.event === "signup_completed")).toHaveLength(1);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  const second = await signup(page);
  const secondSignup = await captured("signup_completed", second.id);
  expect(id(secondSignup)).not.toBe(user.id);
  expect(session(secondSignup)).not.toBe(session(created));
  await createProject(page);
  expect(session(await captured("project_created", second.id))).toBe(session(secondSignup));
  expect(events.filter((event) => event.event === "signup_completed")).toHaveLength(2);
  const custom = events.filter((event) => !event.event.startsWith("$"));
  expect(JSON.stringify(custom)).not.toMatch(/Analytics Test|Analytics Project|@test.local|analytics-test-123/);
  await writeFile(
    `${root}/verified-events.json`,
    JSON.stringify(
      {
        environment: "local real SDK, synthetic Users",
        checkedAt: new Date().toISOString(),
        events: events
          .filter((event) => ["$pageview", "$identify", "signup_completed", "project_created"].includes(event.event))
          .map((event) => ({
            event: event.event,
            distinct_id: id(event),
            session_id: session(event),
            timestamp: event.timestamp,
          })),
      },
      null,
      2,
    ) + "\n",
  );
});

test("first mutation after idle rotates the actual SDK session before dispatch", async ({ page }) => {
  test.skip(!!process.env.ANALYTICS_DISABLED);
  const user = await signup(page);
  const signedUp = await captured("signup_completed", user.id);
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + 31 * 60 * 1000));
  const request = await createProject(page);
  const created = await captured("project_created", user.id);
  expect(session(created)).toBeTruthy();
  expect(session(created)).not.toBe(session(signedUp));
  expect(request.headers()["x-posthog-session-id"]).toBe(session(created));
});

test("restored auth identifies a browser with no persisted analytics identity", async ({ page, context }) => {
  test.skip(!!process.env.ANALYTICS_DISABLED);
  const user = await signup(page);
  await captured("signup_completed", user.id);
  for (const cookie of await context.cookies()) {
    if (cookie.name.startsWith("ph_")) await context.clearCookies({ name: cookie.name });
  }
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith("ph_")) localStorage.removeItem(key);
    sessionStorage.clear();
  });
  events.length = 0;
  await page.reload();
  const pageview = await captured("$pageview", user.id);
  expect(id(pageview)).toBe(user.id);
  expect(events.filter((event) => event.event === "signup_completed")).toHaveLength(0);
});

test("expired auth resets persisted identity before anonymous capture", async ({ page, context }) => {
  test.skip(!!process.env.ANALYTICS_DISABLED);
  const user = await signup(page);
  const signedUp = await captured("signup_completed", user.id);
  for (const cookie of await context.cookies()) {
    if (cookie.name.includes("better-auth")) await context.clearCookies({ name: cookie.name });
  }
  await page.goto("/");
  await expect.poll(() => events.findLast((event) => event.event === "$pageview")?.properties.$current_url).toBe("/");
  const anonymous = events.findLast((event) => event.event === "$pageview")!;
  expect(id(anonymous)).not.toBe(user.id);
  expect(session(anonymous)).not.toBe(session(signedUp));
});

test("credential and Participant entry routes never capture even with a PM session", async ({ page }) => {
  test.skip(!!process.env.ANALYTICS_DISABLED);
  await signup(page);
  await captured("signup_completed");
  await createProject(page);
  const projectId = new URL(page.url()).pathname.split("/").at(-1);
  await captured("project_created");
  const start = events.length;
  // Same document: the SDK was already initialized before the address became a credential.
  await page.evaluate(() => window.history.pushState({}, "", "/invite/analytics-secret-token"));
  const request = page.waitForRequest((req) => req.url().endsWith("/api/assistant/chat"));
  await page.route("**/api/assistant/chat", (route) => route.fulfill({ status: 200, body: "{}" }));
  await page.evaluate(() => fetch("/api/assistant/chat", { method: "POST", body: "{}" }));
  expect((await request).headers()["x-posthog-session-id"]).toBeUndefined();
  await page.goto("/invite/analytics-secret-token");
  await page.goto(`/m/${projectId}/login`);
  await page.waitForTimeout(3500); // Allow the SDK batch interval to expose unwanted automatic events.
  expect(JSON.stringify(events.slice(start))).not.toContain("analytics-secret-token");
  expect(
    events
      .slice(start)
      .filter((event) => event.event === "$pageview" && /\/invite\/|\/m\//.test(String(event.properties.$current_url))),
  ).toHaveLength(0);
});

test("unavailable or unconfigured analytics does not prevent signup or Project creation", async ({ page }) => {
  unavailable = true;
  await signup(page);
  await createProject(page);
  await expect(page.getByRole("heading", { name: "Analytics Project" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
});

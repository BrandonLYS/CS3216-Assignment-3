import { expect, test, type BrowserContext } from "@playwright/test";

let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;

test.beforeAll(async ({ request }) => {
  const response = await request.post("/api/auth/sign-up/email", {
    data: { name: "Brand checks", email: `branding-${Date.now()}@test.local`, password: "branding-password-123" },
  });
  expect(response.ok()).toBeTruthy();
  cookies = (await request.storageState()).cookies;
});

test("public pages use the PrismPM wordmark, title and icon", async ({ page }) => {
  for (const route of ["/", "/login", "/signup"]) {
    await page.goto(route);
    await expect(page).toHaveTitle(/PrismPM/);
    await expect(page.getByText("PrismPM", { exact: true }).first()).toBeVisible();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /favicon\.ico/);
  }
  const favicon = await page.request.get("/favicon.ico");
  expect(favicon.ok()).toBeTruthy();
  expect(favicon.headers()["content-type"]).toContain("image/");
});

for (const scenario of [
  { name: "legacy open", legacy: "1", current: null, expected: "1" },
  { name: "legacy closed", legacy: "0", current: null, expected: "0" },
  { name: "new closed overrides legacy open", legacy: "1", current: "0", expected: "0" },
  { name: "new open overrides legacy closed", legacy: "0", current: "1", expected: "1" },
  { name: "fresh browser", legacy: null, current: null, expected: null },
]) {
  test(`Assistant preference: ${scenario.name}`, async ({ page, context }) => {
    await context.addCookies(cookies);
    await page.goto("/login");
    await page.evaluate(({ legacy, current }) => {
      localStorage.clear();
      if (legacy !== null) localStorage.setItem("vantage.assistant-open", legacy);
      if (current !== null) localStorage.setItem("prismpm.assistant-open", current);
    }, scenario);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
    const dock = page.getByRole("complementary", { name: "Assistant", exact: true });
    if (scenario.expected === "1") await expect(dock).toBeVisible();
    else await expect(dock).toBeHidden();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("vantage.assistant-open"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("prismpm.assistant-open"))).toBe(scenario.expected);
    await page.reload();
    if (scenario.expected === "1") await expect(dock).toBeVisible();
    else await expect(dock).toBeHidden();
    await page.getByRole("button", { name: "Assistant", exact: true }).click();
    await page.reload();
    if (scenario.expected === "1") await expect(dock).toBeHidden();
    else await expect(dock).toBeVisible();
  });
}

test("new tokens authenticate MCP with the prismpm identity and can be revoked", async ({ page, context }) => {
  await context.addCookies(cookies);
  await page.goto("/settings");
  await page.getByLabel("Label", { exact: true }).fill("Brand verification");
  await page.getByRole("button", { name: "Generate token" }).click();
  const tokenElement = page.getByRole("status").locator("code").first();
  await expect(tokenElement).toHaveText(/^prismpm_[A-Za-z0-9_-]{32}$/);
  const token = await tokenElement.innerText();
  const initialize = () =>
    page.request.post("/api/mcp", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream" },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "brand-check", version: "1.0.0" },
        },
      },
    });
  const response = await initialize();
  expect(response.ok()).toBeTruthy();
  const body = await response.text();
  const payload =
    body.startsWith("event:") || body.startsWith("data:")
      ? JSON.parse(
          body
            .split("\n")
            .find((line) => line.startsWith("data:"))!
            .slice(5),
        )
      : JSON.parse(body);
  expect(payload.result.serverInfo.name).toBe("prismpm");
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  expect((await initialize()).status()).toBe(401);
});

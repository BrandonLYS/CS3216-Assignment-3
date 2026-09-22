import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "analytics.spec.ts",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3001",
    viewport: { width: 1440, height: 900 },
    // PostHog deliberately ignores headless/automated browser events.
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  },
  webServer: {
    command: "node e2e/analytics-server.mjs",
    url: "http://localhost:3001/login",
    reuseExistingServer: !!process.env.ANALYTICS_REUSE_SERVER,
    timeout: 60_000,
  },
});

import { chromium } from "@playwright/test";

const base = "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${base}/login`);
await page.fill('input[type="email"]', "demo@example.com");
await page.fill('input[type="password"]', "demo-password-123");
await page.click('button[type="submit"]');
await page.waitForURL(`${base}/`, { timeout: 15000 });

await page.click("text=Data Warehouse Mig");
await page.waitForLoadState("networkidle");
await page.click('button:has-text("Assistant")');
await page.waitForSelector('aside[aria-label="Assistant"]');
await page.waitForTimeout(800);

// New chat inside the project, ask for a write that needs approval
await page.click('button[aria-label="New chat"]');
await page.waitForTimeout(500);
await page.fill('aside[aria-label="Assistant"] textarea', "make the milestone descriptions more detailed please");
await page.press('aside[aria-label="Assistant"] textarea', "Enter");

// Wait for an approval card or a finished turn
await page.waitForTimeout(18000);
await page.screenshot({ path: "/tmp/milestone-approval.png" });

const card = await page.locator('button:has-text("Allow once"), button:has-text("Always allow")').count();
console.log("approval buttons visible:", card);

await browser.close();
console.log("done");

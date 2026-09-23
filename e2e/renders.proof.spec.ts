import { expect, test, type Page } from "@playwright/test";

/**
 * Visual proof for the Renders tab. Run against the seeded demo account:
 *   npm run db:seed && npx playwright test e2e/renders.proof.spec.ts
 */
const email = process.env.DEMO_EMAIL ?? "demo@example.com";
const password = process.env.DEMO_PASSWORD ?? "demo-password-123";
const shot = (name: string) => ({ path: `artifacts/${name}.png`, fullPage: false });

/** Screenshots race image decoding, so wait for every <img> to have painted. */
async function imagesLoaded(page: Page) {
  await expect
    .poll(() => page.locator("img").evaluateAll((els) => els.every((e) => (e as HTMLImageElement).complete)))
    .toBe(true);
}

async function openRenders(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard");
  await page.goto("/projects");
  await page.getByRole("link", { name: "Bedok Community Centre" }).first().click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Renders" }).click();
  await expect(page).toHaveURL(/\/renders$/);
}

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });

test("seeded renders display with provenance", async ({ page }) => {
  await openRenders(page);
  await expect(page.getByText("Concept renders illustrate intent")).toBeVisible();
  await expect(page.locator("img")).toHaveCount(2);
  await imagesLoaded(page);
  await page.screenshot(shot("after-renders-tab"));

  for (const summary of await page.getByText("How this was made").all()) await summary.click();
  await expect(page.getByText("tongyi-mai/z-image-turbo").first()).toBeVisible();
  // The seeded Renders carry the seeds they were really generated with, not a placeholder.
  await expect(page.getByText("101", { exact: true })).toBeVisible();
  await expect(page.getByText("202", { exact: true })).toBeVisible();
  await page.screenshot(shot("after-renders-provenance"));
});

// Generation is a live third-party call, so this one is skipped without a key.
test("generating a render shows pending, then the image", async ({ page }) => {
  test.skip(!process.env.POLLINATIONS_API_KEY, "POLLINATIONS_API_KEY is not set");
  test.setTimeout(180_000);
  await openRenders(page);
  await page.getByRole("button", { name: "New render" }).click();
  await page
    .getByLabel("Description")
    .fill("A single storey timber pavilion with a wide overhanging roof beside a pond");
  await page.getByRole("button", { name: "Generate" }).click();

  await expect(page.getByText("Generating").first()).toBeVisible();
  await page.screenshot(shot("after-renders-pending"));

  // The catch-up poll refreshes the page once the image lands.
  await expect(page.locator("img")).toHaveCount(3, { timeout: 150_000 });
  await expect(page.getByText("Generating")).toHaveCount(0);
  await imagesLoaded(page);
  await page.screenshot(shot("after-renders-generated"));
});

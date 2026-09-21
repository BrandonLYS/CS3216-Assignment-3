import { expect, test } from "@playwright/test";

const chapterTitles = [
  "The plan, stated once",
  "Decisions, and what they rest on",
  "Evidence down to the passage",
  "An Assistant on the same base",
];

for (const viewport of [
  { width: 844, height: 390 },
  { width: 820, height: 768 },
  { width: 1280, height: 600 },
]) {
  test(`all chapters remain readable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    for (const title of chapterTitles) {
      const heading = page.getByRole("heading", { name: title, exact: true });
      await expect(heading).toBeVisible();
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeInViewport({ ratio: 1 });
      const box = await heading.boundingBox();
      const header = await page.getByRole("banner").boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    }
  });
}

test("desktop scrubbing survives switching to a compact viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const section = page.locator("#how");
  const video = section.locator("video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);

  await page.evaluate(() => {
    const section = document.querySelector("#how")!;
    window.scrollTo({
      top: section.getBoundingClientRect().top + window.scrollY + window.innerHeight,
      behavior: "instant",
    });
  });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(1);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(section.getByRole("heading", { level: 3 })).toHaveCount(4);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(section.getByRole("heading", { level: 3 })).toHaveCount(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(section.getByRole("heading", { level: 3 })).toHaveCount(4);
});

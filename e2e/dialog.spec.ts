import { expect, test } from "@playwright/test";

test("dialogs contain keyboard focus and return it to their trigger", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Keyboard User");
  await page.getByLabel("Email").fill(`keyboard-${Date.now()}@test.local`);
  await page.getByLabel("Password").fill("keyboard-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  const trigger = page.getByRole("main").getByRole("button", { name: "New project", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("button", { name: "Create project", exact: true }).focus();
  await page.keyboard.press("Tab");
  // Browsers may put the address bar between the last and first modal controls.
  if (!(await page.evaluate(() => document.hasFocus()))) await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  if (!(await page.evaluate(() => document.hasFocus()))) await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Create project", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

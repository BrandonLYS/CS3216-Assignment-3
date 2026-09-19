import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile navigation leaves room for the page and the Assistant stays on screen", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Mobile User");
  await page.getByLabel("Email").fill(`mobile-${Date.now()}@test.local`);
  await page.getByLabel("Password").fill("mobile-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("main")).toHaveJSProperty("clientWidth", 390);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeInViewport();

  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("dialog", { name: "Navigation" });
  await navigation.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(navigation).toBeHidden();
  await expect(page).toHaveURL("/settings");

  await page.getByRole("button", { name: "Open navigation" }).click();
  await navigation.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  const assistant = page.getByRole("complementary", { name: "Assistant", exact: true });
  await expect(assistant).toBeInViewport({ ratio: 1 });
  await expect(assistant.getByRole("textbox", { name: "Message" })).toBeInViewport({ ratio: 1 });
  await assistant.getByRole("button", { name: "Close Assistant" }).click();
  await expect(assistant).toBeHidden();

  await page.getByRole("button", { name: "New project", exact: true }).click();
  const project = page.getByRole("dialog", { name: "New project" });
  await project.getByLabel("Name").fill("Mobile verification project");
  await project.getByLabel("Key").fill(`M${Date.now().toString(36).slice(-5)}`);
  await project.getByRole("button", { name: "Create project" }).click();
  await expect(project).toBeHidden();
  await expect(page.getByRole("main")).toHaveJSProperty("clientWidth", 390);
  await page.getByRole("main").getByRole("link", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByRole("dialog").getByLabel("Title").fill("Task created on mobile");
  await page.getByRole("dialog").getByRole("button", { name: "Create task" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Task created on mobile", { exact: true })).toBeInViewport();
});

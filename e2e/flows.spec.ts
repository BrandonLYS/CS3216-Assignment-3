import { expect, test, type Page } from "@playwright/test";
import { addDays, format } from "date-fns";
import fs from "node:fs";
import path from "node:path";

/**
 * End-to-end walkthrough of every user flow. Each `test.describe` is one flow and drops
 * numbered screenshots into docs/<flow>/screenshots so the docs stay in sync with the UI.
 * Runs serially against a single fresh account created in the first flow.
 */

const run = Date.now();
const stamp = run.toString(36).toUpperCase().slice(-4);
const key = `F${stamp}`;
const email = `flows-${run}@test.local`;
const password = "flows-password-123";
const projectName = "Payments Migration";

const shots = (flow: string) => {
  const dir = path.join("docs", flow, "screenshots");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  return (page: Page, name: string) =>
    page.screenshot({
      path: path.join(dir, `${String(++n).padStart(2, "0")}-${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

async function openProject(page: Page, section?: string) {
  await login(page);
  await page.getByRole("link", { name: projectName }).first().click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  if (section) {
    await page.getByRole("link", { name: section, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/[0-9a-f-]{36}/${section.toLowerCase()}$`));
  }
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

test.describe("auth", () => {
  const shot = shots("auth");

  test("redirects anonymous visitors, signs up, signs out and signs back in", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login\?next=%2Fprojects/);
    await shot(page, "login-redirect");

    await page.goto("/signup");
    await page.getByLabel("Name").fill("Flows User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await shot(page, "signup-filled");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText("No projects yet", { exact: true })).toBeVisible();
    await shot(page, "empty-workspace");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await shot(page, "signed-out");

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await shot(page, "login-wrong-password");

    await login(page);
    await shot(page, "logged-in");
  });
});

test.describe("project", () => {
  const shot = shots("project");

  test("creates a project and lands on its overview", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByLabel("Key").fill(key);
    await page.getByLabel("Description").fill("Move card processing from the legacy gateway to the new PSP.");
    await shot(page, "create-dialog");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await shot(page, "overview-empty");

    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page).toHaveURL("/projects");
    await expect(page.getByRole("link", { name: projectName }).first()).toBeVisible();
    await shot(page, "projects-list");
  });
});

test.describe("people", () => {
  const shot = shots("people");

  test("adds a team and people, edits and removes them", async ({ page }) => {
    await openProject(page, "People");
    await shot(page, "empty");

    await page.getByRole("button", { name: "Add team" }).click();
    await page.getByLabel("Name").fill("Team B — Backend API");
    await page.getByLabel("Description").fill("Owns the gateway integration");
    await shot(page, "add-team-dialog");
    await page.getByRole("button", { name: "Add team" }).last().click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Team B — Backend API")).toBeVisible();

    for (const [name, role] of [
      ["Priya Nair", "Backend lead"],
      ["Marcus Lee", "QA"],
    ]) {
      await page.getByRole("button", { name: "Add person" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Name").fill(name);
      await dialog.getByLabel("Role").fill(role);
      await dialog.getByLabel("Email").fill(`${name.split(" ")[0].toLowerCase()}@example.com`);
      await dialog.getByLabel("Team").selectOption({ label: "Team B — Backend API" });
      if (name === "Priya Nair") await shot(page, "add-person-dialog");
      await dialog.getByRole("button", { name: "Add person" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(name)).toBeVisible();
    }
    await expect(page.getByText("2 people")).toBeVisible();
    await shot(page, "people-and-team");

    // Edit a person's role.
    const row = page.locator("div.group", { hasText: "Marcus Lee" }).first();
    await row.hover();
    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByLabel("Role").fill("QA lead");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("QA lead")).toBeVisible();

    // Add and remove a throwaway person to cover delete.
    await page.getByRole("button", { name: "Add person" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill("Temp Contractor");
    await page.getByRole("dialog").getByRole("button", { name: "Add person" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    const temp = page.locator("div.group", { hasText: "Temp Contractor" }).first();
    await temp.hover();
    await temp.getByRole("button", { name: "Delete" }).click();
    await shot(page, "remove-person-confirm");
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Temp Contractor")).toBeHidden();
    await shot(page, "final");
  });
});

test.describe("settings", () => {
  const shot = shots("settings");

  test("edits details, manages statuses and labels", async ({ page }) => {
    await openProject(page, "Settings");
    await shot(page, "overview");

    // Details
    await page.getByLabel("Health").selectOption("amber");
    await page.getByLabel("Start date").fill("2026-09-01");
    await page.getByLabel("Target date").fill("2026-12-15");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
    await shot(page, "details-saved");

    // Custom task status
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("In QA");
    await dialog.getByLabel("Category").selectOption("in_progress");
    await shot(page, "add-status-dialog");
    await dialog.getByRole("button", { name: "Add status" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("In QA", { exact: true })).toBeVisible();

    // Labels
    for (const name of ["backend", "vendor"]) {
      await page.getByRole("button", { name: "Add label" }).click();
      await page.getByRole("dialog").getByLabel("Name").fill(name);
      await page.getByRole("dialog").getByRole("button", { name: "Add label" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    await shot(page, "statuses-and-labels");

    // Deleting the project needs the key typed; cancel to keep it.
    await page.getByRole("button", { name: "Delete project" }).click();
    await shot(page, "delete-project-confirm");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("tasks", () => {
  const shot = shots("tasks");

  test("creates, edits, filters and moves tasks between list and board", async ({ page }) => {
    await openProject(page, "Tasks");
    await shot(page, "empty");

    const tasks = [
      {
        title: "Implement v2 endpoints",
        start: "2026-09-10",
        due: "2026-09-20",
        owner: "Priya Nair",
        priority: "high",
      },
      {
        title: "Load-test the new gateway",
        start: "2026-09-21",
        due: "2026-09-28",
        owner: "Marcus Lee",
        priority: "medium",
      },
      { title: "Write cutover runbook", start: "", due: "2026-10-02", owner: "", priority: "low" },
    ];
    for (const t of tasks) {
      await page.getByRole("button", { name: "New task" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Title").fill(t.title);
      await dialog.getByLabel("Priority").selectOption(t.priority);
      if (t.owner) await dialog.getByLabel("Owner").selectOption({ label: t.owner });
      if (t.start) await dialog.getByLabel("Start date").fill(t.start);
      await dialog.getByLabel("Due date").fill(t.due);
      if (t.title === tasks[0].title) {
        await dialog.getByLabel("Description").fill("Expose /v2/charges and /v2/refunds behind the feature flag.");
        await dialog.getByLabel("Team").selectOption({ label: "Team B — Backend API" });
        await dialog.getByRole("button", { name: "backend" }).click();
        await shot(page, "create-dialog");
      }
      await dialog.getByRole("button", { name: "Create task" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(t.title)).toBeVisible();
    }
    await expect(page.getByText(`${key}-1`)).toBeVisible();
    await expect(page.getByText(`${key}-3`)).toBeVisible();
    await shot(page, "list");

    // Edit: move the first task to In Progress.
    await page.getByText(tasks[0].title).click();
    await expect(page.getByRole("dialog", { name: `${key}-1` })).toBeVisible();
    await shot(page, "edit-dialog");
    await page.getByLabel("Status").selectOption({ label: "In Progress" });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    const inProgress = page.locator("section", { hasText: "In Progress" }).first();
    await expect(inProgress.getByText(tasks[0].title)).toBeVisible();
    await shot(page, "list-after-status-change");

    // Board view groups by status.
    await page.getByRole("button", { name: "board view" }).click();
    await expect(page.getByText(tasks[0].title)).toBeVisible();
    await shot(page, "board");

    // Delete the third task from its dialog.
    await page.getByText(tasks[2].title).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await shot(page, "delete-confirm");
    await page.getByRole("dialog").getByRole("button", { name: "Delete task" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(tasks[2].title)).toBeHidden();
    await page.getByRole("button", { name: "list view" }).click();
    await shot(page, "list-after-delete");
  });
});

test.describe("timeline", () => {
  const shot = shots("timeline");

  test("adds milestones, links dependencies and shows them on the Gantt", async ({ page }) => {
    await openProject(page, "Timeline");
    await expect(page.getByText("2 scheduled")).toBeVisible();
    await shot(page, "tasks-only");

    await page.getByRole("button", { name: "New milestone" }).click();
    await page.getByLabel("Name").fill("UAT begins");
    await page.getByLabel("Due date").fill("2026-10-05");
    await shot(page, "new-milestone-dialog");
    await page.getByRole("button", { name: "Create milestone" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("3 scheduled")).toBeVisible();

    // Dependency: load test is blocked by the endpoints task.
    await page.getByRole("link", { name: "Tasks", exact: true }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await page.getByText("Load-test the new gateway").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Milestone").selectOption({ label: "UAT begins" });
    await dialog.getByRole("button", { name: "Add predecessor" }).click();
    await dialog.getByRole("combobox").filter({ hasText: "Choose…" }).selectOption({ label: "Implement v2 endpoints" });
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("Implement v2 endpoints").last()).toBeVisible();
    await shot(page, "dependency-editor");

    // A cycle must be rejected.
    await dialog.getByRole("button", { name: "Add successor" }).click();
    await dialog.getByRole("combobox").filter({ hasText: "Choose…" }).selectOption({ label: "Implement v2 endpoints" });
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText(/cycle|already|circular/i)).toBeVisible();
    await shot(page, "dependency-cycle-rejected");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("link", { name: "Timeline", exact: true }).click();
    await expect(page.getByText("3 scheduled · 1 dependencies")).toBeVisible();
    await shot(page, "gantt-with-dependency");
    await page.getByRole("button", { name: "Zoom out" }).click();
    await shot(page, "gantt-zoomed-out");
  });
});

test.describe("risks", () => {
  const shot = shots("risks");

  test("records risks, changes severity inline and closes one", async ({ page }) => {
    await openProject(page, "Risks");
    await shot(page, "empty");

    await page.getByRole("button", { name: "New risk" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Vendor access delay blocks testing");
    await dialog.getByLabel("Cause").fill("PSP sandbox credentials not yet issued");
    await dialog.getByLabel("Impact", { exact: true }).fill("Load test slips a week");
    await dialog.getByLabel("Probability").selectOption("high");
    await dialog.getByLabel("Impact level").selectOption("high");
    await dialog.getByLabel("Owner").selectOption({ label: "Priya Nair" });
    await dialog.getByLabel("Mitigation").fill("Escalate to vendor PM; use mock server meanwhile");
    await dialog.getByLabel("Review date").fill("2026-09-25");
    await shot(page, "new-risk-dialog");
    await dialog.getByRole("button", { name: "Create risk" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("R-1")).toBeVisible();

    await page.getByRole("button", { name: "New risk" }).click();
    await page.getByRole("dialog").getByLabel("Title").fill("Key engineer on leave during cutover");
    await page.getByRole("dialog").getByLabel("Probability").selectOption("low");
    await page.getByRole("dialog").getByRole("button", { name: "Create risk" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("2 risks · sorted by severity")).toBeVisible();
    await shot(page, "register");

    // Open R-2 and close it via the dialog, then toggle Show closed.
    await page.getByText("Key engineer on leave during cutover").click();
    await expect(page.getByRole("dialog", { name: "R-2" })).toBeVisible();
    await shot(page, "edit-dialog");
    const closed = page
      .getByRole("dialog")
      .getByLabel("Status")
      .locator("option", { hasText: /closed|resolved|accepted/i })
      .first();
    await page
      .getByRole("dialog")
      .getByLabel("Status")
      .selectOption({ label: (await closed.textContent()) ?? "" });
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("1 risk · sorted by severity")).toBeVisible();
    await page.getByLabel("Show closed").check();
    await expect(page.getByText("2 risks · sorted by severity")).toBeVisible();
    await shot(page, "register-with-closed");
  });
});

test.describe("evidence", () => {
  const shot = shots("evidence");

  test("adds pasted notes and an uploaded file, edits and deletes", async ({ page }) => {
    await openProject(page, "Evidence");
    await shot(page, "empty");

    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Weekly sync minutes — 12 Sep");
    await dialog.getByLabel("Kind").selectOption("minutes");
    await dialog.getByLabel("Source date").fill("2026-09-12");
    await dialog
      .getByLabel("Pasted text")
      .fill(
        "Attendees: Priya, Marcus\n\n- v2 endpoints on track for 20 Sep\n- Vendor sandbox still pending\n- UAT proposed for 5 Oct",
      );
    await shot(page, "add-dialog");
    await dialog.getByRole("button", { name: "Add evidence" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Weekly sync minutes — 12 Sep" })).toBeVisible();
    await shot(page, "pasted-notes");

    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Title").fill("Cutover plan v1");
    await page.getByRole("dialog").getByLabel("Kind").selectOption("plan");
    await page
      .getByRole("dialog")
      .getByLabel("File")
      .setInputFiles({
        name: "cutover-plan.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Cutover plan\n\n1. Freeze legacy\n2. Flip flag\n3. Monitor 24h\n"),
      });
    await page.getByRole("dialog").getByRole("button", { name: "Add evidence" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByRole("button", { name: "Cutover plan v1" }).click();
    await expect(page.getByRole("link", { name: /cutover-plan\.md/ })).toBeVisible();
    await expect(page.getByText("2 items")).toBeVisible();
    await shot(page, "uploaded-file");

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByLabel("Notes").fill("Superseded by v2 after the vendor call");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Superseded by v2 after the vendor call")).toBeVisible();

    await page.getByRole("button", { name: "Delete" }).click();
    await shot(page, "delete-confirm");
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("1 item", { exact: true })).toBeVisible();
    await shot(page, "after-delete");
  });
});

test.describe("overview", () => {
  const shot = shots("overview");

  test("project overview and workspace home reflect everything recorded", async ({ page }) => {
    await openProject(page);
    await expect(page.getByText(/changed status on Task "Implement v2 endpoints"/)).toBeVisible();
    await expect(page.getByText(/created Milestone "UAT begins"/)).toBeVisible();
    await expect(page.getByText(/created Risk "Vendor access delay blocks testing"/)).toBeVisible();
    await shot(page, "project-overview");

    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: projectName }).first()).toBeVisible();
    await shot(page, "workspace-dashboard");
  });
});

test.describe("calendar", () => {
  const shot = shots("calendar");

  test("workspace and project calendars show due dates and milestones", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Calendar", exact: true }).click();
    await expect(page).toHaveURL("/calendar");
    await expect(page.getByTitle("Implement v2 endpoints")).toBeVisible();
    await shot(page, "workspace-september");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByTitle("UAT begins")).toBeVisible();
    await shot(page, "workspace-october");

    await page.getByRole("link", { name: projectName }).first().click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await page.locator("nav").last().getByRole("link", { name: "Calendar", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/calendar$/);
    await expect(page.getByTitle("Implement v2 endpoints")).toBeVisible();
    await shot(page, "project-calendar");

    // Clicking an event opens the task.
    await page.getByTitle("Implement v2 endpoints").click();
    await expect(page.getByRole("dialog", { name: `${key}-1` })).toBeVisible();
    await shot(page, "event-opens-task");
  });
});

test.describe("command-palette", () => {
  const shot = shots("command-palette");

  test("⌘K jumps between sections and projects", async ({ page }) => {
    await login(page);
    await page.keyboard.press("Meta+k");
    const input = page.getByPlaceholder("Type a command or search…");
    await expect(input).toBeVisible();
    await shot(page, "open");
    await input.fill("Payments");
    await shot(page, "search-project");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

    await page.keyboard.press("Meta+k");
    await input.fill("Risks");
    await shot(page, "search-section");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/risks$/);
    await shot(page, "navigated-to-risks");
  });
});

test.describe("comments", () => {
  const shot = shots("comments");

  test("posts, lists, counts and deletes a Comment on a Task", async ({ page }) => {
    await openProject(page, "Tasks");
    await page.getByText("Implement v2 endpoints").first().click();
    const dialog = page.getByRole("dialog", { name: `${key}-1` });
    await expect(dialog.getByText("No comments yet.")).toBeVisible();
    await shot(page, "task-dialog-empty-thread");

    const body = "Vendor confirmed 17 Sep in Friday's meeting.\nSee https://example.com/minutes";
    const composer = dialog.getByRole("textbox", { name: "Comment" });
    await composer.fill(body);
    await dialog.getByLabel("Said by").selectOption({ label: "Priya Nair" });
    await dialog.getByLabel("Said on").fill("2026-09-12");
    await shot(page, "composer-filled");
    await composer.press("ControlOrMeta+Enter");
    const thread = dialog.getByRole("listitem").filter({ hasText: "Vendor confirmed 17 Sep" });
    await expect(thread).toBeVisible();
    await expect(thread.getByText("Priya Nair")).toBeVisible();
    await expect(thread.getByText("said 12 Sep 2026")).toBeVisible();
    await expect(thread.getByRole("link", { name: "https://example.com/minutes" })).toBeVisible();
    await expect(composer).toHaveValue("");
    await expect(dialog).toBeVisible(); // posting never submits the parent form
    await shot(page, "comment-posted");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTitle("1 comment")).toBeVisible();
    await shot(page, "list-with-count");
    await page.getByRole("button", { name: "board view" }).click();
    await expect(page.getByTitle("1 comment")).toBeVisible();
    await shot(page, "board-with-count");
    await page.getByRole("button", { name: "list view" }).click();

    await page.getByText("Implement v2 endpoints").first().click();
    await dialog.getByRole("button", { name: "Delete comment" }).click();
    await expect(dialog.getByText("Delete this comment?")).toBeVisible();
    await shot(page, "delete-confirm");
    await dialog
      .getByRole("listitem")
      .filter({ hasText: "Delete this comment?" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(dialog.getByText("No comments yet.")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTitle("1 comment")).toBeHidden();

    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page.getByText(new RegExp(`created Comment "${key}-1: Vendor confirmed`))).toBeVisible();
    await expect(page.getByText(new RegExp(`deleted Comment "${key}-1: Vendor confirmed`))).toBeVisible();
    await shot(page, "overview-feed");
  });
});

test.describe("attention", () => {
  const shot = shots("attention");
  // Attention rules key on the server's calendar date, so the fixtures are dated relative to now.
  const d = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");

  test("overview groups attention by rule, dashboard shows per-project counts, items open their dialog", async ({
    page,
  }) => {
    await openProject(page, "Tasks");
    const create = async (title: string, o: { start?: string; due: string }) => {
      await page.getByRole("button", { name: "New task" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Title").fill(title);
      if (o.start) await dialog.getByLabel("Start date").fill(o.start);
      await dialog.getByLabel("Due date").fill(o.due);
      await dialog.getByRole("button", { name: "Create task" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(title).first()).toBeVisible();
    };
    await create("Reconcile legacy ledger", { due: d(-3) }); // -> task_overdue
    await create("Rotate PSP credentials", { due: d(20) }); // -> task_blocked
    await page.getByText("Rotate PSP credentials").first().click();
    await page.getByRole("dialog").getByLabel("Status").selectOption({ label: "Blocked" });
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await create("Vendor delivers sandbox", { due: d(10) }); // upstream
    await create("Run vendor smoke test", { start: d(2), due: d(6) }); // -> dependency_late
    await page.getByText("Run vendor smoke test").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Add predecessor" }).click();
    await dialog
      .getByRole("combobox")
      .filter({ hasText: "Choose…" })
      .selectOption({ label: "Vendor delivers sandbox" });
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("Vendor delivers sandbox").last()).toBeVisible();
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await shot(page, "tasks-seeded");

    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const list = page.locator("section", { hasText: "Needs attention" }).first();
    await expect(list.getByText("Overdue", { exact: true }).first()).toBeVisible();
    // Tolerant of midnight/clock skew between Playwright and the server: any past-day count.
    await expect(list.getByText(/Due .*, \d+ days? ago/)).toBeVisible();
    await expect(list.getByText("Blocked", { exact: true }).first()).toBeVisible();
    await expect(list.getByText("Late dependency", { exact: true }).first()).toBeVisible();
    await expect(list.getByText(/Depends on .*, due .*, after start/)).toBeVisible();
    await shot(page, "overview-groups");

    // Collapsing a group keeps its count visible in the summary.
    await list.getByText("Overdue", { exact: true }).first().click();
    await expect(list.getByText("Reconcile legacy ledger")).toBeHidden();
    await expect(list.getByText("Overdue", { exact: true }).first()).toBeVisible();
    await shot(page, "overview-collapsed");

    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL("/");
    const row = page.getByRole("link", { name: projectName }).filter({ hasText: /overdue/ });
    await expect(row.getByText(/\d+ overdue/)).toBeVisible();
    await expect(row.getByText(/\d+ blocked/)).toBeVisible();
    await expect(row.getByText(/\d+ late dependenc/)).toBeVisible();
    await expect(page.getByText("Due in 7 days")).toBeVisible();
    await shot(page, "dashboard-counts");

    await page.getByTestId("attention-item").filter({ hasText: "Reconcile legacy ledger" }).first().click();
    await expect(page).toHaveURL(/\/tasks\?task=/);
    await expect(page.getByRole("dialog").getByLabel("Title")).toHaveValue("Reconcile legacy ledger");
    await shot(page, "item-opens-task");
  });
});

test.describe("history", () => {
  const shot = shots("history");

  test("shows an item's field changes, grouped per save, with names and dates", async ({ page }) => {
    await openProject(page, "Tasks");
    await page.getByRole("button", { name: "New task" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab")).toHaveCount(0); // create mode: no tabs
    await shot(page, "create-dialog-no-tabs");
    await dialog.getByLabel("Title").fill("Rotate PSP API keys");
    await dialog.getByLabel("Due date").fill("2026-09-18");
    await dialog.getByRole("button", { name: "Create task" }).click();
    await expect(dialog).toBeHidden();

    await page.getByText("Rotate PSP API keys").click();
    await expect(dialog.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    await shot(page, "edit-dialog-details-tab");
    await dialog.getByRole("tab", { name: "History" }).click();
    await expect(dialog.getByText("Created", { exact: true })).toBeVisible();
    await shot(page, "history-fresh");

    await dialog.getByRole("tab", { name: "Details" }).click();
    await dialog.getByLabel("Status").selectOption({ label: "In Progress" });
    await dialog.getByLabel("Owner").selectOption({ label: "Priya Nair" });
    await dialog.getByLabel("Due date").fill("2026-09-23");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();

    await page.getByText("Rotate PSP API keys").click();
    await dialog.getByRole("tab", { name: "History" }).click();
    const panel = dialog.getByRole("tabpanel", { name: "History" });
    for (const t of ["Todo", "In Progress", "Priya Nair", "18 Sep 2026", "23 Sep 2026"]) {
      await expect(panel.getByText(t)).toBeVisible();
    }
    await expect(panel.locator("ol > li")).toHaveCount(2); // one group per save + Created
    await expect(panel.locator("li").last()).toHaveText("Created");
    await shot(page, "history-after-save");

    await dialog.getByRole("tab", { name: "History" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(dialog.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    await shot(page, "keyboard-back-to-details");
  });
});

// Must stay last: it creates a second Project, which earlier flows' `.first()` locators tolerate but do not expect.
test.describe("task-search", () => {
  const shot = shots("task-search");
  const key2 = `G${stamp}`;
  const project2 = "Vendor Portal";

  test("⌘K finds tasks across projects by key and title and opens the task", async ({ page }) => {
    // Second project with two tasks, created through the UI.
    await login(page);
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(project2);
    await page.getByLabel("Key").fill(key2);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await page.getByRole("link", { name: "Tasks", exact: true }).click();
    for (const title of ["Sign vendor contract", "Load-test vendor portal"]) {
      await page.getByRole("button", { name: "New task" }).click();
      await page.getByRole("dialog").getByLabel("Title").fill(title);
      await page.getByRole("dialog").getByRole("button", { name: "Create task" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(page.getByText(title)).toBeVisible();
    }
    await shot(page, "second-project-tasks");

    // Key search from the Dashboard → result shows project name → Enter opens the dialog.
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL("/");
    await page.keyboard.press("Meta+k");
    const input = page.getByPlaceholder("Type a command or search…");
    await input.fill(`${key}-1`);
    const hit = page.getByRole("option", { name: new RegExp(`^${key}-1`) });
    await expect(hit).toContainText("Implement v2 endpoints");
    await expect(hit).toContainText(projectName);
    await shot(page, "search-by-key");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\?task=[0-9a-f-]{36}$/);
    await expect(page.getByRole("dialog", { name: `${key}-1` })).toBeVisible();
    await shot(page, "task-dialog-open");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // Key variants: lower-case with a space.
    await page.keyboard.press("Meta+k");
    await input.fill(`${key2.toLowerCase()} 2`);
    await expect(page.getByRole("option", { name: new RegExp(`^${key2}-2`) })).toContainText("Load-test vendor portal");
    await shot(page, "search-key-variant");

    // Title fragment matches both projects.
    await input.fill("load-test");
    await expect(page.getByRole("option", { name: /Load-test the new gateway/ })).toContainText(projectName);
    await expect(page.getByRole("option", { name: /Load-test vendor portal/ })).toContainText(project2);
    await shot(page, "search-by-title");

    await input.fill("zzqx-nothing");
    await expect(page.getByText("No tasks match")).toBeVisible();
    await shot(page, "no-tasks-match");
  });
});

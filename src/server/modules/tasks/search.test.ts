import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { projectsService } from "@/server/modules/projects/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { parseTaskQuery, searchTasks } from "./search";
import { tasksService } from "./service";
import { searchTasksSchema } from "./validation";

let ctx: Ctx;
let stranger: Ctx;
let acme: { id: string };
let beta: { id: string };

const add = (c: Ctx, projectId: string, title: string) =>
  tasksService.create(c, { projectId, title, priority: "none" });

beforeAll(async () => {
  ctx = await makeCtx();
  acme = await makeProject(ctx, "ACME");
  beta = await makeProject(ctx, "BETA");
  const old = await makeProject(ctx, "OLD");
  await projectsService.update(ctx, { id: old.id, status: "archived" });
  stranger = await makeCtx();
  const theirs = await makeProject(stranger, "ACME");

  for (const t of ["Sign vendor contract", "Migrate gateway", "Vendor SLA review"]) await add(ctx, acme.id, t);
  for (const t of ["Vendor onboarding", "Gateway load test"]) await add(ctx, beta.id, t);
  await add(ctx, old.id, "Archived vendor task");
  for (const t of ["Their secret task", "Their vendor task"]) await add(stranger, theirs.id, t);
});
afterAll(closeDb);

const keys = (rows: { projectKey: string; number: number }[]) => rows.map((r) => `${r.projectKey}-${r.number}`);

describe("parseTaskQuery", () => {
  it("parses ACME-2, acme 2 and acme2 as the same key", () => {
    for (const q of ["ACME-2", "acme 2", "acme2"]) {
      expect(parseTaskQuery(q)).toEqual({ key: { projectKey: "ACME", number: 2 }, text: q });
    }
  });

  it("accepts digits in the key when a separator is present (F1AB-1) and not otherwise", () => {
    expect(parseTaskQuery("F1AB-1")).toEqual({ key: { projectKey: "F1AB", number: 1 }, text: "F1AB-1" });
    expect(parseTaskQuery("f1ab 1").key).toEqual({ projectKey: "F1AB", number: 1 });
    expect(parseTaskQuery("F1AB1")).toEqual({ text: "F1AB1" });
  });

  it("treats bare digits as a number only when a current project id is given", () => {
    expect(parseTaskQuery("42", "some-project")).toEqual({ number: 42, text: "42" });
    expect(parseTaskQuery("42")).toEqual({ text: "42" });
  });

  it("falls back to text for ordinary words", () => {
    expect(parseTaskQuery("  vendor contract ")).toEqual({ text: "vendor contract" });
  });
});

describe("searchTasks", () => {
  it('returns the exact key match first for "ACME-2"', async () => {
    const rows = await searchTasks(ctx, { q: "ACME-2", limit: 10 });
    expect(rows[0]).toMatchObject({
      projectKey: "ACME",
      number: 2,
      title: "Migrate gateway",
      projectName: "Project ACME",
      projectId: acme.id,
    });
    expect(rows[0]!.status.category).toBeDefined();
    expect(rows[0]!.status.color).toBeTruthy();
  });

  it('matches the key case-insensitively with a space or no separator ("acme 2", "acme2")', async () => {
    for (const q of ["acme 2", "acme2", "Acme-2"]) {
      const rows = await searchTasks(ctx, { q, limit: 10 });
      expect(rows[0]).toMatchObject({ projectKey: "ACME", number: 2 });
    }
  });

  it("resolves a bare number inside the current project", async () => {
    const rows = await searchTasks(ctx, { q: "1", currentProjectId: beta.id, limit: 10 });
    expect(rows[0]).toMatchObject({ projectKey: "BETA", number: 1, title: "Vendor onboarding" });
    expect(await searchTasks(ctx, { q: "1", limit: 10 })).toEqual([]);
  });

  it("matches title substrings case-insensitively", async () => {
    const rows = await searchTasks(ctx, { q: "VENDOR", limit: 10 });
    expect(keys(rows).sort()).toEqual(["ACME-1", "ACME-3", "BETA-1"]);
    expect(rows.every((r) => r.projectKey !== "OLD")).toBe(true);
    expect(rows.some((r) => r.title.startsWith("Their"))).toBe(false);
  });

  it("ranks current-project title matches above other projects", async () => {
    const fromBeta = await searchTasks(ctx, { q: "vendor", currentProjectId: beta.id, limit: 10 });
    expect(fromBeta[0]).toMatchObject({ projectKey: "BETA", number: 1 });

    const fromAcme = await searchTasks(ctx, { q: "vendor", currentProjectId: acme.id, limit: 10 });
    expect(fromAcme.slice(0, 2).every((r) => r.projectKey === "ACME")).toBe(true);
    expect(fromAcme[2]).toMatchObject({ projectKey: "BETA" });
  });

  it("ranks an exact key hit above title hits", async () => {
    await add(ctx, acme.id, "ACME-1 follow-up");
    const rows = await searchTasks(ctx, { q: "ACME-1", limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ projectKey: "ACME", number: 1, title: "Sign vendor contract" });
    expect(rows[1]).toMatchObject({ title: "ACME-1 follow-up" });
  });

  it("orders ties by most recently updated", async () => {
    const acme1 = (await searchTasks(ctx, { q: "ACME-1", limit: 1 }))[0]!;
    await tasksService.update(ctx, { id: acme1.id, title: "Sign vendor contract (v2)" });
    const rows = await searchTasks(ctx, { q: "vendor", currentProjectId: acme.id, limit: 10 });
    expect(keys(rows.slice(0, 2))).toEqual(["ACME-1", "ACME-3"]);
  });

  it("caps results at limit", async () => {
    for (let i = 1; i <= 12; i++) await add(ctx, beta.id, `Bulk item ${i}`);
    expect(await searchTasks(ctx, { q: "Bulk item", limit: 10 })).toHaveLength(10);
    expect(await searchTasks(ctx, { q: "Bulk item", limit: 3 })).toHaveLength(3);
  });

  it("excludes tasks in archived projects", async () => {
    expect(await searchTasks(ctx, { q: "Archived", limit: 10 })).toEqual([]);
  });

  it("never returns another user's tasks", async () => {
    const mine = await searchTasks(ctx, { q: "ACME-1", limit: 10 });
    expect(mine.every((r) => r.projectId === acme.id)).toBe(true);
    expect(await searchTasks(ctx, { q: "secret", limit: 10 })).toEqual([]);

    const theirs = await searchTasks(stranger, { q: "ACME-1", limit: 10 });
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({ projectKey: "ACME", number: 1, title: "Their secret task" });
    expect(theirs[0]!.projectId).not.toBe(acme.id);
  });

  it("treats LIKE metacharacters literally", async () => {
    expect(await searchTasks(ctx, { q: "100%", limit: 10 })).toEqual([]);
    expect(await searchTasks(ctx, { q: "v_ndor", limit: 10 })).toEqual([]);
    await add(ctx, beta.id, "Reach 100% coverage");
    expect(keys(await searchTasks(ctx, { q: "100%", limit: 10 }))).toHaveLength(1);
  });

  it("treats an underscore as a literal character, not a single-char wildcard", async () => {
    await add(ctx, beta.id, "Run load_test harness");
    await add(ctx, beta.id, "Run load-test harness");
    const rows = await searchTasks(ctx, { q: "load_test", limit: 10 });
    expect(rows.map((r) => r.title)).toEqual(["Run load_test harness"]);
    expect(await searchTasks(ctx, { q: "load\\test", limit: 10 })).toEqual([]);
  });
});

describe("searchTasksSchema", () => {
  it("rejects a query shorter than 2 characters", () => {
    expect(searchTasksSchema.safeParse({ q: "a" }).success).toBe(false);
    expect(searchTasksSchema.safeParse({ q: " x " }).success).toBe(false);
  });

  it("trims, defaults limit to 10 and caps it at 10", () => {
    const parsed = searchTasksSchema.safeParse({ q: " ab " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ q: "ab", limit: 10 });
    expect(searchTasksSchema.safeParse({ q: "ab", limit: 50 }).success).toBe(false);
    expect(searchTasksSchema.safeParse({ q: "ab", currentProjectId: "not-a-uuid" }).success).toBe(false);
  });
});

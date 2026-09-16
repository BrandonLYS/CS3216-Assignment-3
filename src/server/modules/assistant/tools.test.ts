import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError } from "@/server/core/errors";
import { activityRepo } from "@/server/modules/activity/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { toAiTools } from "./ai-tools";
import { ASSISTANT_TOOLS, findTool } from "./tools";

let ctx: Ctx;
let projectId: string;

beforeAll(async () => {
  ctx = { ...(await makeCtx()), via: "assistant" };
  projectId = (await makeProject(ctx, "AST")).id;
});
afterAll(closeDb);

const run = (name: string, input: Record<string, unknown>, c: Ctx = ctx) =>
  findTool(name).handler(c, findTool(name).input.parse(input));

describe("assistant tool registry", () => {
  it("exposes the v1 tools by name", () => {
    expect(ASSISTANT_TOOLS.map((t) => t.name).sort()).toEqual([
      "create_milestone",
      "create_task",
      "get_project_summary",
      "get_task",
      "list_tasks",
      "update_milestone",
      "update_task",
    ]);
  });

  it("summarises the Project with ids and Status categories", async () => {
    const summary = (await run("get_project_summary", { projectId })) as {
      project: { id: string; key: string };
      statuses: { id: string; name: string; category: string; scope: string; isDefault: boolean }[];
      tasks: unknown[];
    };
    expect(summary.project).toMatchObject({ id: projectId, key: "AST" });
    expect(summary.statuses.some((s) => s.scope === "task" && s.isDefault)).toBe(true);
    expect(summary.statuses.every((s) => s.id && s.category)).toBe(true);
  });

  it("creates a Task with the default Status and stamps the Activity Event via Assistant", async () => {
    const task = (await run("create_task", { projectId, title: "Write test plan", dueDate: "2026-10-30" })) as {
      id: string;
      number: number;
      statusId: string;
    };
    const summary = (await run("get_project_summary", { projectId })) as {
      statuses: { id: string; scope: string; isDefault: boolean }[];
    };
    expect(task.statusId).toBe(summary.statuses.find((s) => s.scope === "task" && s.isDefault)!.id);
    const history = await activityRepo.forEntity(ctx.db, task.id);
    expect(history[0]?.event.via).toBe("assistant");
  });

  it("creates and updates a Milestone", async () => {
    const m = (await run("create_milestone", { projectId, name: "UAT begins", dueDate: "2026-11-01" })) as {
      id: string;
    };
    const after = (await run("update_milestone", { id: m.id, dueDate: "2026-11-08" })) as { dueDate: string };
    expect(after.dueDate).toBe("2026-11-08");
  });

  it("refuses a Project the User does not own", async () => {
    const stranger = await makeCtx();
    await expect(run("list_tasks", { projectId }, stranger)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("toAiTools", () => {
  const opts = { toolCallId: "t", messages: [], context: undefined };

  it("binds projectId from the scope and hides it from the model-facing schema", async () => {
    const tools = toAiTools(ctx, ASSISTANT_TOOLS, { projectId });
    const listTasks = tools.list_tasks!;
    expect(Object.keys((listTasks.inputSchema as unknown as { shape: object }).shape)).not.toContain("projectId");
    const out = (await listTasks.execute!({}, opts)) as unknown[];
    expect(Array.isArray(out)).toBe(true);
  });

  it("returns domain errors as a result the model can read instead of throwing", async () => {
    const tools = toAiTools(ctx, ASSISTANT_TOOLS, { projectId });
    const out = await tools.update_task!.execute!({ id: "00000000-0000-0000-0000-000000000000", title: "Nope" }, opts);
    expect(out).toMatchObject({ error: expect.stringContaining("not found") });
  });
});

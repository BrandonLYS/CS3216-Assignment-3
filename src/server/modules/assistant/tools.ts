import { z } from "zod";
import type { Ctx } from "@/server/core/context";
import { NotFoundError } from "@/server/core/errors";
import { milestonesService } from "@/server/modules/milestones/service";
import { createMilestoneSchema, updateMilestoneSchema } from "@/server/modules/milestones/validation";
import { loadProjectRefs } from "@/server/modules/projects/refs";
import { projectsService } from "@/server/modules/projects/service";
import { updateProjectSchema } from "@/server/modules/projects/validation";
import { risksService } from "@/server/modules/risks/service";
import { tasksService } from "@/server/modules/tasks/service";
import { createTaskSchema, updateTaskSchema } from "@/server/modules/tasks/validation";

/**
 * One Assistant tool (ADR 0007): a name the model calls, a zod input and a handler that only
 * calls `service.ts` functions, so ownership, validation and Activity Events apply as for the UI.
 * Inputs that carry `projectId` are Project-scoped; the chat route binds it, MCP passes it.
 */
export interface ToolDef<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  input: S;
  handler: (ctx: Ctx, input: z.infer<S>) => Promise<unknown>;
  /** Destructive or Project-level: the User confirms a card first; excluded from MCP (no UI). */
  requiresConfirmation?: true;
  /** Card text naming the concrete target and change, e.g. `Delete Task PM-12 “Write test plan”?`. */
  describe?: (ctx: Ctx, input: z.infer<S>) => Promise<string>;
}

const defineTool = <S extends z.ZodObject>(t: ToolDef<S>) => t as ToolDef;

const projectScoped = z.object({ projectId: z.string() });
const q = (s: unknown) => `“${String(s)}”`;
const changeList = (patch: Record<string, unknown>) =>
  Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k} → ${v === null || v === "" ? "cleared" : q(v)}`)
    .join(", ");

export const ASSISTANT_TOOLS: ToolDef[] = [
  defineTool({
    name: "get_project_summary",
    description:
      "The Project's Statuses (with category and scope), People, Teams, Labels, Milestones, Tasks and Risks, all with ids. Call this first; reference everything by id.",
    input: projectScoped,
    handler: async (ctx, { projectId }) => {
      const [refs, tasks, risks] = await Promise.all([
        loadProjectRefs(ctx, projectId),
        tasksService.list(ctx, projectId),
        risksService.list(ctx, projectId),
      ]);
      return {
        project: refs.project,
        statuses: refs.statuses,
        people: refs.people,
        teams: refs.teams,
        labels: refs.labels,
        milestones: refs.milestones,
        tasks: tasks.map((t) => ({ ...t.task, status: t.status.name, labelIds: t.labels.map((l) => l.id) })),
        risks: risks.map((r) => r.risk),
      };
    },
  }),
  defineTool({
    name: "list_tasks",
    description: "All Tasks in the Project with their Status, assignee, Team, Milestone and Labels.",
    input: projectScoped,
    handler: (ctx, { projectId }) => tasksService.list(ctx, projectId),
  }),
  defineTool({
    name: "get_task",
    description: "One Task by id, with Status, assignee, Team, Milestone and Labels.",
    input: z.object({ id: z.string() }),
    handler: async (ctx, { id }) => {
      const task = await tasksService.get(ctx, id);
      if (!task) throw new NotFoundError("Task");
      return task;
    },
  }),
  defineTool({
    name: "create_task",
    description:
      "Create a Task. statusId, assigneeId, teamId, milestoneId and labelIds must be ids from get_project_summary; omit statusId for the default Status. Dates are YYYY-MM-DD.",
    input: createTaskSchema,
    handler: (ctx, input) => tasksService.create(ctx, input),
  }),
  defineTool({
    name: "update_task",
    description: "Change fields on a Task by id. Only send the fields that change; ids come from get_project_summary.",
    input: updateTaskSchema,
    handler: (ctx, input) => tasksService.update(ctx, input),
  }),
  defineTool({
    name: "delete_task",
    description: "Delete a Task by id. The User confirms first.",
    input: z.object({ id: z.string() }),
    requiresConfirmation: true,
    describe: async (ctx, { id }) => {
      const t = await tasksService.get(ctx, id);
      if (!t) throw new NotFoundError("Task");
      const project = await projectsService.get(ctx, t.task.projectId);
      return `Delete Task ${project.key}-${t.task.number} ${q(t.task.title)}?`;
    },
    handler: (ctx, { id }) => tasksService.delete(ctx, id).then(() => ({ deleted: id })),
  }),
  defineTool({
    name: "create_milestone",
    description: "Create a Milestone with a due date (YYYY-MM-DD). statusId and ownerId are optional ids.",
    input: createMilestoneSchema,
    handler: (ctx, input) => milestonesService.create(ctx, input),
  }),
  defineTool({
    name: "update_milestone",
    description: "Change fields on a Milestone by id. Only send the fields that change.",
    input: updateMilestoneSchema,
    handler: (ctx, input) => milestonesService.update(ctx, input),
  }),
  defineTool({
    name: "delete_milestone",
    description: "Delete a Milestone by id. Tasks keep existing but lose the link. The User confirms first.",
    input: z.object({ id: z.string() }),
    requiresConfirmation: true,
    describe: async (ctx, { id }) => `Delete Milestone ${q((await milestonesService.get(ctx, id)).name)}?`,
    handler: (ctx, { id }) => milestonesService.delete(ctx, id).then(() => ({ deleted: id })),
  }),
  defineTool({
    name: "update_project",
    description:
      "Change the Project itself: name, key, description, status, health, startDate or targetDate. The User confirms first.",
    input: updateProjectSchema.omit({ id: true }).extend({ projectId: z.string() }),
    requiresConfirmation: true,
    describe: async (ctx, { projectId, ...patch }) =>
      `Update Project ${(await projectsService.get(ctx, projectId)).key}: ${changeList(patch)}?`,
    handler: (ctx, { projectId, ...patch }) => projectsService.update(ctx, { id: projectId, ...patch }),
  }),
];

export function findTool(name: string): ToolDef {
  const t = ASSISTANT_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`Unknown Assistant tool: ${name}`);
  return t;
}

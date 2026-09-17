import { addDays, formatISO, parseISO } from "date-fns";
import type { Ctx } from "@/server/core/context";
import { activityRepo } from "@/server/modules/activity/service";
import { dependenciesRepo } from "@/server/modules/dependencies/repository";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { projectsRepo } from "@/server/modules/projects/repository";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { risksRepo } from "@/server/modules/risks/repository";
import { tasksRepo } from "@/server/modules/tasks/repository";
import { TERMINAL_CATEGORIES, type AttentionRule } from "@/shared/domain";
import { today } from "@/shared/lib/dates";
import { assumptionsRepo, edgesRepo } from "@/server/modules/decisions/repository";
import { compareAttention, evaluateAttention, type AttentionInput, type AttentionItem } from "./attention";

export type { AttentionGroup, AttentionItem, AttentionResult } from "./attention";

/** Cross-Project "Needs attention" list is capped so it stays scannable. */
export const ATTENTION_DASHBOARD_LIMIT = 10;
/** "Upcoming milestones" window — a calendar concern, not an attention rule. */
const UPCOMING_MILESTONE_DAYS = 14;

const iso = (d: Date) => formatISO(d, { representation: "date" });

/**
 * Rows a caller has already loaded for the Project, so the Overview does not query the same
 * collections twice. Anything omitted is fetched here.
 */
export interface ProjectAttentionRows {
  tasks: Awaited<ReturnType<typeof tasksRepo.listByProject>>;
  milestones: Awaited<ReturnType<typeof milestonesRepo.listByProject>>;
  risks: Awaited<ReturnType<typeof risksRepo.listByProject>>;
  dependencies?: Awaited<ReturnType<typeof dependenciesRepo.listByProject>>;
}

/**
 * One Project's attention items grouped by rule (issue #7). `opts.today` exists only so
 * tests are deterministic; production callers let it default to the server's calendar date.
 * Pass `opts.rows` when the page already holds the collections (Project Overview).
 */
export async function projectAttention(
  ctx: Ctx,
  projectId: string,
  opts: { today?: string; rows?: ProjectAttentionRows } = {},
) {
  const project = await assertOwnsProject(ctx.db, ctx.userId, projectId);
  const { rows } = opts;
  const [tasks, milestones, risks, dependencies, assumptions] = await Promise.all([
    rows?.tasks ?? tasksRepo.listByProject(ctx.db, projectId),
    rows?.milestones ?? milestonesRepo.listByProject(ctx.db, projectId),
    rows?.risks ?? risksRepo.listByProject(ctx.db, projectId),
    rows?.dependencies ?? dependenciesRepo.listByProject(ctx.db, projectId),
    brokenAssumptions(ctx.db, [projectId]),
  ]);
  return evaluateAttention({
    today: opts.today ?? today(),
    project,
    tasks,
    milestones,
    risks,
    dependencies,
    assumptions: assumptions.get(projectId) ?? [],
  });
}

/** Broken, undismissed Assumptions per Project with how many Decisions rest on each (issue #38). */
async function brokenAssumptions(db: Ctx["db"], projectIds: string[]) {
  const rows = await assumptionsRepo.listAlertsByProjects(db, projectIds);
  const out = new Map<string, NonNullable<AttentionInput["assumptions"]>>();
  if (!rows.length) return out;
  const supports = await edgesRepo.listByKindForProjects(db, projectIds, "supports");
  for (const a of rows) {
    const list = out.get(a.projectId) ?? [];
    list.push({
      id: a.id,
      statement: a.statement,
      brokenReason: a.brokenReason,
      affectedDecisions: supports.filter((e) => e.fromId === a.id).length,
    });
    out.set(a.projectId, list);
  }
  return out;
}

function bucket<T>(rows: T[], key: (row: T) => string) {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/**
 * Cross-project read model for the Dashboard. Deliberately plain queries and
 * deterministic rules — this is the surface the future Health Briefing will enrich.
 * Attention is the same evaluator the Project Overview uses, run once per active Project.
 */
export async function workspaceOverview(ctx: Ctx, opts: { today?: string } = {}) {
  const projects = await projectsRepo.listByOwner(ctx.db, ctx.userId);
  const active = projects.filter((p) => p.status === "active" || p.status === "on_hold");
  const ids = active.map((p) => p.id);
  const todayIso = opts.today ?? today();
  const todayDate = parseISO(todayIso);
  const horizon = iso(addDays(todayDate, UPCOMING_MILESTONE_DAYS));
  const weekAgo = addDays(todayDate, -7);

  const [openTasks, milestones, risks, dependencies, activity, assumptions] = await Promise.all([
    tasksRepo.listOpenByProjects(ctx.db, ids),
    milestonesRepo.listByProjects(ctx.db, ids),
    risksRepo.listByProjects(ctx.db, ids),
    dependenciesRepo.listByProjects(ctx.db, ids),
    activityRepo.recentForProjects(ctx.db, ids, weekAgo, 30),
    brokenAssumptions(ctx.db, ids),
  ]);

  const byId = new Map(projects.map((p) => [p.id, p]));
  const tasksByProject = bucket(openTasks, (t) => t.task.projectId);
  const milestonesByProject = bucket(milestones, (m) => m.milestone.projectId);
  const risksByProject = bucket(risks, (r) => r.risk.projectId);
  const dependenciesByProject = bucket(dependencies, (d) => d.projectId);

  const all: AttentionItem[] = [];
  const byProject = new Map<string, { counts: Record<AttentionRule, number>; total: number }>();
  const stats = { activeProjects: active.length, overdue: 0, dueSoon: 0, blocked: 0, topRisks: 0 };
  for (const project of active) {
    const result = evaluateAttention({
      today: todayIso,
      project,
      tasks: tasksByProject.get(project.id) ?? [],
      milestones: milestonesByProject.get(project.id) ?? [],
      risks: risksByProject.get(project.id) ?? [],
      dependencies: dependenciesByProject.get(project.id) ?? [],
      assumptions: assumptions.get(project.id) ?? [],
    });
    const total = result.groups.reduce((n, g) => n + g.items.length, 0);
    byProject.set(project.id, { counts: result.counts, total });
    for (const g of result.groups) all.push(...g.items);
    stats.overdue += result.counts.task_overdue;
    stats.dueSoon += result.counts.task_due_soon;
    stats.blocked += result.counts.task_blocked;
    stats.topRisks += result.counts.risk_top;
  }

  const upcomingMilestones = milestones
    .filter((m) => !TERMINAL_CATEGORIES.has(m.status.category) && m.milestone.dueDate <= horizon)
    .sort((a, b) => a.milestone.dueDate.localeCompare(b.milestone.dueDate));

  return {
    /** Every Project the User owns — for the empty state and `projectById` lookups. */
    projects,
    /** The Dashboard roster (user story 18): archived/completed Projects are not shown. */
    activeProjects: active,
    projectById: (id: string) => byId.get(id),
    stats,
    attention: { items: all.sort(compareAttention).slice(0, ATTENTION_DASHBOARD_LIMIT), byProject },
    upcomingMilestones,
    activity,
  };
}

/** Everything dated across active projects, for the workspace calendar. */
export async function workspaceCalendar(ctx: Ctx) {
  const projects = await projectsRepo.listByOwner(ctx.db, ctx.userId);
  const ids = projects.filter((p) => p.status !== "archived").map((p) => p.id);
  const [tasks, milestones] = await Promise.all([
    tasksRepo.listDatedByProjects(ctx.db, ids),
    milestonesRepo.listByProjects(ctx.db, ids),
  ]);
  return { projects, tasks, milestones };
}

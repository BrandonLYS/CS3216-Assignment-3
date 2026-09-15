import { addDays, formatISO } from "date-fns";
import type { Ctx } from "@/server/core/context";
import { activityRepo } from "@/server/modules/activity/service";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { projectsRepo } from "@/server/modules/projects/repository";
import { risksRepo } from "@/server/modules/risks/repository";
import { tasksRepo } from "@/server/modules/tasks/repository";
import { TERMINAL_CATEGORIES, riskSeverity } from "@/shared/domain";

const iso = (d: Date) => formatISO(d, { representation: "date" });

/**
 * Cross-project read model for the Dashboard. Deliberately plain queries and
 * deterministic rules — this is the surface the future Health Briefing will enrich.
 */
export async function workspaceOverview(ctx: Ctx) {
  const projects = await projectsRepo.listByOwner(ctx.db, ctx.userId);
  const active = projects.filter((p) => p.status === "active" || p.status === "on_hold");
  const ids = active.map((p) => p.id);
  const todayIso = iso(new Date());
  const horizon = iso(addDays(new Date(), 14));
  const weekAgo = addDays(new Date(), -7);

  const [openTasks, milestones, risks, activity] = await Promise.all([
    tasksRepo.listOpenByProjects(ctx.db, ids),
    milestonesRepo.listByProjects(ctx.db, ids),
    risksRepo.listByProjects(ctx.db, ids),
    activityRepo.recentForProjects(ctx.db, ids, weekAgo, 30),
  ]);

  const byId = new Map(projects.map((p) => [p.id, p]));

  const overdueTasks = openTasks
    .filter((t) => t.task.dueDate && t.task.dueDate < todayIso)
    .sort((a, b) => a.task.dueDate!.localeCompare(b.task.dueDate!));
  const dueSoonTasks = openTasks
    .filter((t) => t.task.dueDate && t.task.dueDate >= todayIso && t.task.dueDate <= horizon)
    .sort((a, b) => a.task.dueDate!.localeCompare(b.task.dueDate!));
  const blockedTasks = openTasks.filter((t) => t.status.category === "blocked");

  const upcomingMilestones = milestones
    .filter((m) => !TERMINAL_CATEGORIES.has(m.status.category) && m.milestone.dueDate <= horizon)
    .sort((a, b) => a.milestone.dueDate.localeCompare(b.milestone.dueDate));

  const topRisks = risks
    .filter((r) => !TERMINAL_CATEGORIES.has(r.status.category))
    .map((r) => ({ ...r, severity: riskSeverity(r.risk) }))
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 6);

  return {
    projects,
    projectById: (id: string) => byId.get(id),
    stats: {
      activeProjects: active.length,
      overdue: overdueTasks.length,
      dueSoon: dueSoonTasks.length,
      blocked: blockedTasks.length,
      openRisks: risks.filter((r) => !TERMINAL_CATEGORIES.has(r.status.category)).length,
    },
    overdueTasks,
    dueSoonTasks,
    blockedTasks,
    upcomingMilestones,
    topRisks,
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

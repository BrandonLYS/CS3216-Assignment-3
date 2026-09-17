import type { Ctx } from "@/server/core/context";
import { activityRepo } from "@/server/modules/activity/service";
import { assumptionsRepo, decisionsRepo, edgesRepo, sourcesRepo } from "@/server/modules/decisions/repository";
import type { AssumptionRow, DecisionSourceRow } from "@/server/modules/decisions/schema";
import { dependenciesRepo } from "@/server/modules/dependencies/repository";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { risksRepo } from "@/server/modules/risks/repository";
import { tasksRepo } from "@/server/modules/tasks/repository";
import type { ConsequenceType } from "@/shared/domain";
import { impactWalk, type WalkItem } from "./walk";

export interface ImpactAlert {
  assumption: AssumptionRow;
  reason: string;
  /** The change that broke it, when the break came from detection. */
  trigger: {
    entityType: string;
    entityLabel: string;
    field: string | null;
    oldValue: unknown;
    newValue: unknown;
    occurredAt: string;
    actorName: string | null;
  } | null;
  decisions: Array<{ id: string; number: number; title: string; status: string; sources: DecisionSourceRow[] }>;
  items: Array<WalkItem & { label: string; code?: string; href: string }>;
}

/** Read model for the Project attention surface (issue #38). Impact is computed on read over the current graph. */
export const impactService = {
  listAlerts: async (ctx: Ctx, projectId: string): Promise<ImpactAlert[]> => {
    const project = await assertOwnsProject(ctx.db, ctx.userId, projectId);
    const alerts = await assumptionsRepo.listAlertsByProjects(ctx.db, [projectId]);
    if (!alerts.length) return [];
    const [edges, dependencies, decisions, tasks, milestones, risks] = await Promise.all([
      edgesRepo.listByProject(ctx.db, projectId),
      dependenciesRepo.listByProject(ctx.db, projectId),
      decisionsRepo.listByProject(ctx.db, projectId),
      tasksRepo.listByProject(ctx.db, projectId),
      milestonesRepo.listByProject(ctx.db, projectId),
      risksRepo.listByProject(ctx.db, projectId),
    ]);
    const sources = await sourcesRepo.listForDecisions(
      ctx.db,
      decisions.map((d) => d.decision.id),
    );
    const base = `/projects/${projectId}`;
    const describe = (i: WalkItem): ImpactAlert["items"][number] | undefined => {
      if (i.type === "task") {
        const t = tasks.find((x) => x.task.id === i.id);
        return (
          t && {
            ...i,
            label: t.task.title,
            code: `${project.key}-${t.task.number}`,
            href: `${base}/tasks?task=${i.id}`,
          }
        );
      }
      if (i.type === "milestone") {
        const m = milestones.find((x) => x.milestone.id === i.id);
        return m && { ...i, label: m.milestone.name, href: `${base}/timeline?milestone=${i.id}` };
      }
      const r = risks.find((x) => x.risk.id === i.id);
      return r && { ...i, label: r.risk.title, code: `R-${r.risk.number}`, href: `${base}/risks?risk=${i.id}` };
    };
    const deps = dependencies.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      successorType: d.successorType,
    }));

    return Promise.all(
      alerts.map(async (assumption) => {
        const watched =
          assumption.subtype === "dependency" && assumption.targetId
            ? dependencies.find((d) => d.id === assumption.targetId)
            : null;
        const walk = impactWalk({
          assumption,
          edges,
          dependencies: deps,
          watchedDependency: watched
            ? { successorType: watched.successorType, successorId: watched.successorId }
            : null,
        });
        const trigger = assumption.brokenByEventId
          ? await activityRepo.findById(ctx.db, assumption.brokenByEventId)
          : null;
        return {
          assumption,
          reason: assumption.brokenReason ?? "Broken by hand",
          trigger: trigger
            ? {
                entityType: trigger.entityType,
                entityLabel: trigger.entityLabel,
                field: trigger.field,
                oldValue: trigger.oldValue,
                newValue: trigger.newValue,
                occurredAt: trigger.occurredAt.toISOString(),
                actorName: null,
              }
            : null,
          decisions: walk.decisionIds.flatMap((id) => {
            const d = decisions.find((x) => x.decision.id === id)?.decision;
            return d
              ? [
                  {
                    id,
                    number: d.number,
                    title: d.title,
                    status: d.status,
                    sources: sources.filter((s) => s.decisionId === id),
                  },
                ]
              : [];
          }),
          items: walk.items.map(describe).filter((x): x is NonNullable<typeof x> => Boolean(x)),
        };
      }),
    );
  },
};

export type { ConsequenceType };

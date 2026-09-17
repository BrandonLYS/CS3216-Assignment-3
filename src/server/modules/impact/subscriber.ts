import { eq } from "drizzle-orm";
import type { Ctx } from "@/server/core/context";
import type { FieldChange } from "@/server/core/diff";
import { db, type DbOrTx } from "@/server/db/client";
import { eventBus, type DomainEvent } from "@/server/events/bus";
import { dependenciesRepo } from "@/server/modules/dependencies/repository";
import { assumptionsRepo } from "@/server/modules/decisions/repository";
import type { AssumptionRow } from "@/server/modules/decisions/schema";
import { decisionsService } from "@/server/modules/decisions/service";
import { milestones } from "@/server/modules/milestones/schema";
import { projects } from "@/server/modules/projects/schema";
import { statuses } from "@/server/modules/statuses/schema";
import { tasks } from "@/server/modules/tasks/schema";
import type { DependencyItemType } from "@/shared/domain";
import { dateContradiction, dependencyContradiction, personContradiction, type DependencyEnd } from "./detector";

const DATE_FIELDS = new Set(["dueDate", "startDate"]);
const DEPENDENCY_FIELDS = new Set(["dueDate", "startDate", "statusId"]);

/** One end of a Dependency with what the blocking rule needs; `null` when the item is gone. */
export async function loadDependencyEnd(
  dbc: DbOrTx,
  type: DependencyItemType,
  id: string,
): Promise<DependencyEnd | null> {
  if (type === "task") {
    const [row] = await dbc
      .select({
        label: tasks.title,
        category: statuses.category,
        statusName: statuses.name,
        dueDate: tasks.dueDate,
        startDate: tasks.startDate,
      })
      .from(tasks)
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(eq(tasks.id, id));
    return row ?? null;
  }
  const [row] = await dbc
    .select({
      label: milestones.name,
      category: statuses.category,
      statusName: statuses.name,
      dueDate: milestones.dueDate,
    })
    .from(milestones)
    .innerJoin(statuses, eq(statuses.id, milestones.statusId))
    .where(eq(milestones.id, id));
  return row ? { ...row, startDate: null } : null;
}

async function systemCtx(projectId: string): Promise<Ctx | null> {
  const [p] = await db.select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, projectId));
  return p ? { db, userId: p.ownerId, via: "system" } : null;
}

async function breakAll(
  ctx: Ctx,
  hits: Array<{ assumption: AssumptionRow; reason: string; change?: FieldChange; event: DomainEvent }>,
) {
  for (const h of hits) {
    await decisionsService.breakAssumption(ctx, {
      id: h.assumption.id,
      brokenByEventId: h.change?.activityEventId ?? h.event.activityEventId ?? null,
      reason: h.reason,
    });
  }
}

/** Contradictions raised by one committed event; exported so tests can drive it directly. */
export async function detectImpact(event: DomainEvent): Promise<void> {
  const ctx = await systemCtx(event.projectId);
  if (!ctx) return;
  const hits: Parameters<typeof breakAll>[1] = [];

  if (event.name === "person.deleted") {
    const watching = await assumptionsRepo.listHoldingWatching(db, event.projectId, "person", event.entityId);
    for (const assumption of watching) hits.push({ assumption, reason: personContradiction(event.entityLabel), event });
  }

  if ((event.name === "task.updated" || event.name === "milestone.updated") && event.changes.length) {
    const dateChanges = event.changes.filter((c) => DATE_FIELDS.has(c.field));
    if (dateChanges.length) {
      const watching = await assumptionsRepo.listHoldingWatching(
        db,
        event.projectId,
        event.entityType as "task" | "milestone",
        event.entityId,
      );
      for (const assumption of watching) {
        for (const change of dateChanges) {
          const reason = dateContradiction(assumption, change, event.entityLabel);
          if (reason) {
            hits.push({ assumption, reason, change, event });
            break;
          }
        }
      }
    }
    const depChange = event.changes.find((c) => DEPENDENCY_FIELDS.has(c.field));
    if (depChange) {
      const candidates = await assumptionsRepo.listHoldingBySubtype(db, event.projectId, "dependency");
      for (const assumption of candidates) {
        if (!assumption.targetId) continue;
        const dep = await dependenciesRepo.findById(db, assumption.targetId);
        if (!dep || (dep.predecessorId !== event.entityId && dep.successorId !== event.entityId)) continue;
        const [pred, succ] = await Promise.all([
          loadDependencyEnd(db, dep.predecessorType, dep.predecessorId),
          loadDependencyEnd(db, dep.successorType, dep.successorId),
        ]);
        if (!pred || !succ) continue;
        const reason = dependencyContradiction(pred, succ);
        if (reason) hits.push({ assumption, reason, change: depChange, event });
      }
    }
  }

  if (hits.length) await breakAll(ctx, hits);
}

const globalForImpact = globalThis as unknown as { __impactRegistered?: boolean };

/** Idempotent: safe to call from `ensureSubscribers` and from tests. */
export function registerImpactDetector() {
  if (globalForImpact.__impactRegistered) return;
  globalForImpact.__impactRegistered = true;
  const handler = (event: DomainEvent) =>
    detectImpact(event).catch((e) => console.error("[impact] detection failed", event.name, event.entityId, e));
  eventBus.subscribe("task.updated", handler);
  eventBus.subscribe("milestone.updated", handler);
  eventBus.subscribe("person.deleted", handler);
}

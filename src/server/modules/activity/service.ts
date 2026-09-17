import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { user } from "@/server/auth/schema";
import type { Ctx } from "@/server/core/context";
import type { DbOrTx } from "@/server/db/client";
import { labelsRepo } from "@/server/modules/labels/service";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { peopleRepo, teamsRepo } from "@/server/modules/people/repository";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { statusesRepo } from "@/server/modules/statuses/repository";
import type { HistoryEntityType } from "@/shared/domain";
import { enrichHistory, type HistoryEntry } from "./enrich";
import { activityEvents, type ActivityEventRow } from "./schema";
import type { ListEntityHistoryInput } from "./validation";

const select = (db: DbOrTx) =>
  db
    .select({ event: activityEvents, actorName: user.name })
    .from(activityEvents)
    .leftJoin(user, eq(user.id, activityEvents.actorId));

export const activityRepo = {
  recentForProject: (db: DbOrTx, projectId: string, limit = 50) =>
    select(db).where(eq(activityEvents.projectId, projectId)).orderBy(desc(activityEvents.occurredAt)).limit(limit),

  recentForProjects: (db: DbOrTx, projectIds: string[], since?: Date, limit = 50) =>
    projectIds.length
      ? select(db)
          .where(
            since
              ? and(inArray(activityEvents.projectId, projectIds), gte(activityEvents.occurredAt, since))
              : inArray(activityEvents.projectId, projectIds),
          )
          .orderBy(desc(activityEvents.occurredAt))
          .limit(limit)
      : Promise.resolve([]),

  findByIds: (db: DbOrTx, ids: string[]): Promise<ActivityEventRow[]> =>
    ids.length ? db.select().from(activityEvents).where(inArray(activityEvents.id, ids)) : Promise.resolve([]),

  findById: async (db: DbOrTx, id: string): Promise<ActivityEventRow | undefined> => {
    const [row] = await db.select().from(activityEvents).where(eq(activityEvents.id, id));
    return row;
  },

  forEntity: (db: DbOrTx, entityId: string) =>
    select(db).where(eq(activityEvents.entityId, entityId)).orderBy(desc(activityEvents.occurredAt)),

  /**
   * All events for one item plus Comment events whose snapshot payload points at it
   * (`CommentSnapshot.entityType/entityId`, see comments/service.ts). Newest first, no limit.
   * Ties on `occurredAt` (create + immediate edit in the same tick) order field rows, then
   * Comment events, then the item's own `created` row so creation is always the bottom-most
   * row; `id` is a random UUID and only breaks the remaining ties deterministically.
   */
  historyForEntity: (db: DbOrTx, projectId: string, entityType: HistoryEntityType, entityId: string) =>
    select(db)
      .where(
        and(
          eq(activityEvents.projectId, projectId),
          or(
            and(eq(activityEvents.entityType, entityType), eq(activityEvents.entityId, entityId)),
            and(
              eq(activityEvents.entityType, "comment"),
              sql`coalesce(${activityEvents.newValue}, ${activityEvents.oldValue}) @> ${JSON.stringify({ entityType, entityId })}::jsonb`,
            ),
          ),
        ),
      )
      .orderBy(
        desc(activityEvents.occurredAt),
        sql`case when ${activityEvents.entityType} = 'comment' then 1 when ${activityEvents.action} = 'created' then 2 else 0 end`,
        desc(activityEvents.id),
      ),
};

const byId = <T extends { id: string; name: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x.name]));

export const activityService = {
  recentForProject: async (ctx: Ctx, projectId: string, limit?: number) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return activityRepo.recentForProject(ctx.db, projectId, limit);
  },

  /** Display-ready History for one Task, Risk or Milestone (ids enriched to current names). */
  listEntityHistory: async (ctx: Ctx, input: ListEntityHistoryInput): Promise<HistoryEntry[]> => {
    await assertOwnsProject(ctx.db, ctx.userId, input.projectId);
    const [rows, statuses, people, teams, milestones, labels] = await Promise.all([
      activityRepo.historyForEntity(ctx.db, input.projectId, input.entityType, input.entityId),
      statusesRepo.listByProject(ctx.db, input.projectId),
      peopleRepo.listByProject(ctx.db, input.projectId),
      teamsRepo.listByProject(ctx.db, input.projectId),
      milestonesRepo.listByProject(ctx.db, input.projectId),
      labelsRepo.listByProject(ctx.db, input.projectId),
    ]);
    return enrichHistory(rows, input.entityType, {
      statuses: byId(statuses),
      people: byId(people),
      teams: byId(teams),
      milestones: byId(milestones.map((m) => m.milestone)),
      labels: byId(labels),
    });
  },
};

export type ActivityItem = Awaited<ReturnType<typeof activityRepo.recentForProject>>[number];

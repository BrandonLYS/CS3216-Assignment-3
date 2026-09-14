import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { user } from "@/server/auth/schema";
import type { Ctx } from "@/server/core/context";
import type { DbOrTx } from "@/server/db/client";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { activityEvents } from "./schema";

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

  forEntity: (db: DbOrTx, entityId: string) =>
    select(db).where(eq(activityEvents.entityId, entityId)).orderBy(desc(activityEvents.occurredAt)),
};

export const activityService = {
  recentForProject: async (ctx: Ctx, projectId: string, limit?: number) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return activityRepo.recentForProject(ctx.db, projectId, limit);
  },
};

export type ActivityItem = Awaited<ReturnType<typeof activityRepo.recentForProject>>[number];

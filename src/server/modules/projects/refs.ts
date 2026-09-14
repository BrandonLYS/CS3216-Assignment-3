import type { Ctx } from "@/server/core/context";
import { labelsRepo } from "@/server/modules/labels/service";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { peopleRepo, teamsRepo } from "@/server/modules/people/repository";
import { statusesRepo } from "@/server/modules/statuses/repository";
import { assertOwnsProject } from "./service";

/** Reference data every project form needs (statuses, people, teams, milestones, labels). */
export async function loadProjectRefs(ctx: Ctx, projectId: string) {
  const project = await assertOwnsProject(ctx.db, ctx.userId, projectId);
  const [statuses, people, teams, milestones, labels] = await Promise.all([
    statusesRepo.listByProject(ctx.db, projectId),
    peopleRepo.listByProject(ctx.db, projectId),
    teamsRepo.listByProject(ctx.db, projectId),
    milestonesRepo.listByProject(ctx.db, projectId),
    labelsRepo.listByProject(ctx.db, projectId),
  ]);
  return {
    project,
    statuses,
    people,
    teams,
    milestones: milestones.map((m) => m.milestone),
    labels,
  };
}

export type ProjectRefs = Awaited<ReturnType<typeof loadProjectRefs>>;

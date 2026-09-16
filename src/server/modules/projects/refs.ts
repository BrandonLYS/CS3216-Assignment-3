import type { Ctx } from "@/server/core/context";
import { evidenceLinksRepo } from "@/server/modules/evidence/repository";
import { labelsRepo } from "@/server/modules/labels/service";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { peopleRepo, teamsRepo } from "@/server/modules/people/repository";
import { statusesRepo } from "@/server/modules/statuses/repository";
import { assertOwnsProject } from "./service";

/**
 * Reference data every project form needs (statuses, people, teams, milestones, labels),
 * plus light Evidence summaries and the project's Evidence links so item dialogs and the
 * Evidence page render links from server props with no fetch on open.
 */
export async function loadProjectRefs(ctx: Ctx, projectId: string) {
  const project = await assertOwnsProject(ctx.db, ctx.userId, projectId);
  const [statuses, people, teams, milestones, labels, evidence, evidenceLinks] = await Promise.all([
    statusesRepo.listByProject(ctx.db, projectId),
    peopleRepo.listByProject(ctx.db, projectId),
    teamsRepo.listByProject(ctx.db, projectId),
    milestonesRepo.listByProject(ctx.db, projectId),
    labelsRepo.listByProject(ctx.db, projectId),
    evidenceLinksRepo.listSummaries(ctx.db, projectId),
    evidenceLinksRepo.listForProject(ctx.db, projectId),
  ]);
  return {
    project,
    statuses,
    people,
    teams,
    milestones: milestones.map((m) => m.milestone),
    labels,
    evidence,
    evidenceLinks,
  };
}

export type ProjectRefs = Awaited<ReturnType<typeof loadProjectRefs>>;

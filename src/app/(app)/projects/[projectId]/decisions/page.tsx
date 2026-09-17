import { Suspense } from "react";
import { ctxForCurrentUser } from "@/server/core/action";
import { decisionsService } from "@/server/modules/decisions/service";
import { dependenciesService } from "@/server/modules/dependencies/service";
import { loadProjectRefs } from "@/server/modules/projects/refs";
import { tasksService } from "@/server/modules/tasks/service";
import { DecisionsView } from "@/features/decision/decisions-view";

export const metadata = { title: "Decisions" };

export default async function DecisionsPage({ params }: PageProps<"/projects/[projectId]/decisions">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const [refs, decisions, candidates, tasks, dependencies] = await Promise.all([
    loadProjectRefs(ctx, projectId),
    decisionsService.list(ctx, projectId),
    decisionsService.sourceCandidates(ctx, projectId),
    tasksService.list(ctx, projectId),
    dependenciesService.list(ctx, projectId),
  ]);
  return (
    <Suspense>
      <DecisionsView
        refs={refs}
        decisions={decisions}
        candidates={candidates}
        tasks={tasks}
        dependencies={dependencies}
      />
    </Suspense>
  );
}

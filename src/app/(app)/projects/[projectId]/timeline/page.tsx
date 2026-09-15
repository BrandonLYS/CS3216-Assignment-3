import { Suspense } from "react";
import { ctxForCurrentUser } from "@/server/core/action";
import { dependenciesService } from "@/server/modules/dependencies/service";
import { milestonesService } from "@/server/modules/milestones/service";
import { loadProjectRefs } from "@/server/modules/projects/refs";
import { tasksService } from "@/server/modules/tasks/service";
import { ProjectTimeline } from "@/widgets/timeline/project-timeline";

export const metadata = { title: "Timeline" };

export default async function TimelinePage({ params }: PageProps<"/projects/[projectId]/timeline">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const [refs, tasks, milestones, dependencies] = await Promise.all([
    loadProjectRefs(ctx, projectId),
    tasksService.list(ctx, projectId),
    milestonesService.list(ctx, projectId),
    dependenciesService.list(ctx, projectId),
  ]);
  return (
    <Suspense>
      <ProjectTimeline refs={refs} tasks={tasks} milestones={milestones} dependencies={dependencies} />
    </Suspense>
  );
}

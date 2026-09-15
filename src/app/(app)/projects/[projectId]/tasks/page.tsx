import { Suspense } from "react";
import { ctxForCurrentUser } from "@/server/core/action";
import { dependenciesService } from "@/server/modules/dependencies/service";
import { loadProjectRefs } from "@/server/modules/projects/refs";
import { tasksService } from "@/server/modules/tasks/service";
import { TasksView } from "@/features/task/tasks-view";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ params }: PageProps<"/projects/[projectId]/tasks">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const [refs, tasks, dependencies] = await Promise.all([
    loadProjectRefs(ctx, projectId),
    tasksService.list(ctx, projectId),
    dependenciesService.list(ctx, projectId),
  ]);
  return (
    <Suspense>
      <TasksView refs={refs} tasks={tasks} dependencies={dependencies} />
    </Suspense>
  );
}

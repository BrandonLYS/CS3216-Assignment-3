import { ctxForCurrentUser } from "@/server/core/action";
import { loadProjectRefs } from "@/server/modules/projects/refs";
import { tasksService } from "@/server/modules/tasks/service";
import { PeopleView } from "@/features/people/people-view";

export const metadata = { title: "People" };

export default async function PeoplePage({ params }: PageProps<"/projects/[projectId]/people">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const [refs, tasks] = await Promise.all([loadProjectRefs(ctx, projectId), tasksService.list(ctx, projectId)]);
  return <PeopleView refs={refs} tasks={tasks} />;
}

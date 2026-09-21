import { notFound } from "next/navigation";
import { ctxForCurrentUser } from "@/server/core/action";
import { DomainError } from "@/server/core/errors";
import { getModel } from "@/server/modules/assistant/model";
import { assistantService } from "@/server/modules/assistant/service";
import { projectsService } from "@/server/modules/projects/service";
import { AssistantDock } from "@/widgets/assistant/assistant-dock";
import { ProjectHeader } from "@/widgets/project-header/project-header";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const project = await projectsService.get(ctx, projectId).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const [dock, projects] = await Promise.all([assistantService.dock(ctx, projectId), projectsService.list(ctx)]);
  const conversations = await assistantService.library(ctx, dock.thread.conversation.id);
  return (
    <>
      <ProjectHeader project={project} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        <AssistantDock
          projectId={projectId}
          projects={projects}
          conversations={conversations}
          thread={dock.thread}
          configured={getModel() !== null}
        />
      </div>
    </>
  );
}

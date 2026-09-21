import { notFound } from "next/navigation";
import { getViewer } from "@/server/auth/viewer";
import { ctxForCurrentUser } from "@/server/core/action";
import { DomainError } from "@/server/core/errors";
import { getModel } from "@/server/modules/assistant/model";
import { assistantService } from "@/server/modules/assistant/service";
import { projectsService } from "@/server/modules/projects/service";
import { AssistantDock } from "@/widgets/assistant/assistant-dock";
import { ProjectHeader } from "@/widgets/project-header/project-header";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  // A Participant gets the bare page (ADR 0009). Everything below this line is the PM's:
  // `projectsService.get` would refuse them, and the Assistant dock is the chrome the ADR
  // forbids a Participant outright.
  const viewer = await getViewer();
  if (viewer?.kind === "participant") return <>{children}</>;
  const ctx = await ctxForCurrentUser();
  const project = await projectsService.get(ctx, projectId).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const { conversation, messages } = await assistantService.conversation(ctx, projectId);
  return (
    <>
      <ProjectHeader project={project} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        <AssistantDock
          projectId={projectId}
          conversationId={conversation.id}
          initialMessages={messages}
          configured={getModel() !== null}
        />
      </div>
    </>
  );
}

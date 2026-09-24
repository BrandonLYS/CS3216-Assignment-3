import { notFound } from "next/navigation";
import { ctxForCurrentUser } from "@/server/core/action";
import { DomainError } from "@/server/core/errors";
import { aiConfigService } from "@/server/modules/ai-config/service";
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
  const [{ conversation, messages }, configs] = await Promise.all([
    assistantService.conversation(ctx, projectId),
    aiConfigService.list(ctx),
  ]);
  return (
    <>
      <ProjectHeader project={project} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        <AssistantDock
          projectId={projectId}
          conversationId={conversation.id}
          initialMessages={messages}
          configured={(await getModel(ctx)) !== null}
          configs={configs}
          modelConfigId={
            configs.some((c) => c.id === conversation.aiConfigId) ? conversation.aiConfigId : (configs[0]?.id ?? null)
          }
        />
      </div>
    </>
  );
}

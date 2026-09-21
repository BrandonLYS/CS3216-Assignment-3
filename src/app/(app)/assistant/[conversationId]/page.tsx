import { notFound } from "next/navigation";
import { ctxForCurrentUser } from "@/server/core/action";
import { DomainError } from "@/server/core/errors";
import { getModel } from "@/server/modules/assistant/model";
import { assistantService } from "@/server/modules/assistant/service";
import { projectsService } from "@/server/modules/projects/service";
import { AssistantPage } from "@/widgets/assistant/assistant-page";

export const metadata = { title: "Assistant" };

export default async function AssistantConversationPage({ params }: PageProps<"/assistant/[conversationId]">) {
  const { conversationId } = await params;
  const ctx = await ctxForCurrentUser();
  const thread = await assistantService.thread(ctx, conversationId).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const [conversations, projects] = await Promise.all([
    assistantService.library(ctx, thread.conversation.id),
    projectsService.list(ctx),
  ]);
  return (
    <AssistantPage
      key={thread.conversation.id}
      conversation={{ id: thread.conversation.id, projectId: thread.conversation.projectId }}
      messages={thread.messages}
      conversations={conversations}
      projects={projects}
      configured={getModel() !== null}
    />
  );
}

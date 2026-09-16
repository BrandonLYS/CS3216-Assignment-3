import { ctxForCurrentUser } from "@/server/core/action";
import { memoryService } from "@/server/modules/memory/service";
import { loadProjectRefs } from "@/server/modules/projects/refs";
import { ProjectSettings } from "@/features/settings/project-settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/projects/[projectId]/settings">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const [refs, memory] = await Promise.all([loadProjectRefs(ctx, projectId), memoryService.versions(ctx, projectId)]);
  return <ProjectSettings refs={refs} memory={memory} />;
}

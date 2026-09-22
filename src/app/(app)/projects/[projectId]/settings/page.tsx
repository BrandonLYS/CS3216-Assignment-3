import { ctxForCurrentUser } from "@/server/core/action";
import { assistantService } from "@/server/modules/assistant/service";
import { memoryService } from "@/server/modules/memory/service";
import { loadProjectRefs } from "@/server/modules/projects/refs";
import { ProjectSettings } from "@/features/settings/project-settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/projects/[projectId]/settings">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const [refs, memory, permissions] = await Promise.all([
    loadProjectRefs(ctx, projectId),
    memoryService.versions(ctx, projectId),
    assistantService.permissions(ctx, projectId),
  ]);
  return <ProjectSettings refs={refs} memory={memory} permissions={permissions} />;
}

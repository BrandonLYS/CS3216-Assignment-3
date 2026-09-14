import { ctxForCurrentUser } from "@/server/core/action";
import { loadProjectRefs } from "@/server/modules/projects/refs";
import { ProjectSettings } from "@/features/settings/project-settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/projects/[projectId]/settings">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const refs = await loadProjectRefs(ctx, projectId);
  return <ProjectSettings refs={refs} />;
}

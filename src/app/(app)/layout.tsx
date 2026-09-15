import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { projectsService } from "@/server/modules/projects/service";
import { AppShell } from "@/widgets/app-shell/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const projects = await projectsService.list({ db, userId: user.id });
  return (
    <AppShell projects={projects} user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth/viewer";
import { db } from "@/server/db/client";
import { projectsService } from "@/server/modules/projects/service";
import { AppShell } from "@/widgets/app-shell/app-shell";

/**
 * The shell is chosen by viewer (ADR 0009). A Participant reaches exactly one page in this
 * group, `/projects/[id]/messages`, and must see none of PrismPM around it: no sidebar, no
 * command palette, no Assistant. Every other page here builds a `Ctx` and turns them away.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  // A forged or expired Participant cookie passes the optimistic proxy and lands here as null;
  // it must behave exactly as no cookie at all did before.
  if (!viewer) redirect("/login");
  if (viewer.kind === "participant") return <>{children}</>;

  const projects = await projectsService.list({ db, userId: viewer.user.id });
  return (
    <AppShell projects={projects} user={{ name: viewer.user.name, email: viewer.user.email }}>
      {children}
    </AppShell>
  );
}

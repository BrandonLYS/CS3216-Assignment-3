import { notFound } from "next/navigation";
import { ctxForCurrentUser } from "@/server/core/action";
import { DomainError } from "@/server/core/errors";
import { projectsService } from "@/server/modules/projects/service";
import { ProjectHeader } from "@/widgets/project-header/project-header";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const project = await projectsService.get(ctx, projectId).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  return (
    <>
      <ProjectHeader project={project} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </>
  );
}

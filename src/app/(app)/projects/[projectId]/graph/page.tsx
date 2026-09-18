import Link from "next/link";
import { notFound } from "next/navigation";
import { ctxForCurrentUser } from "@/server/core/action";
import { DomainError } from "@/server/core/errors";
import { graphService } from "@/server/modules/graph/service";
import { parseNodeParam } from "@/server/modules/graph/validation";
import { PageHeader } from "@/shared/ui";
import { GraphView } from "@/features/graph/graph-view";

export const metadata = { title: "Why" };

export default async function GraphPage({ params, searchParams }: PageProps<"/projects/[projectId]/graph">) {
  const { projectId } = await params;
  const { node } = await searchParams;
  const centre = parseNodeParam(node);
  if (!centre) notFound();
  const ctx = await ctxForCurrentUser();
  const graph = await graphService.neighbourhood(ctx, { projectId, centre }).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title="Why"
        description="What led to this and what follows from it, three steps each way"
        actions={
          <Link href={`/projects/${projectId}/decisions`} className="text-caption text-primary hover:underline">
            Back to Decisions
          </Link>
        }
      />
      <GraphView graph={graph} projectId={projectId} />
    </>
  );
}

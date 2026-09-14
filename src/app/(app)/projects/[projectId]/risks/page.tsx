import { Suspense } from "react";
import { ctxForCurrentUser } from "@/server/core/action";
import { loadProjectRefs } from "@/server/modules/projects/refs";
import { risksService } from "@/server/modules/risks/service";
import { RisksView } from "@/features/risk/risks-view";

export const metadata = { title: "Risks" };

export default async function RisksPage({ params }: PageProps<"/projects/[projectId]/risks">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const [refs, risks] = await Promise.all([loadProjectRefs(ctx, projectId), risksService.list(ctx, projectId)]);
  return (
    <Suspense>
      <RisksView refs={refs} risks={risks} />
    </Suspense>
  );
}

import { Suspense } from "react";
import { ctxForCurrentUser } from "@/server/core/action";
import { evidenceService } from "@/server/modules/evidence/service";
import { loadProjectRefs } from "@/server/modules/projects/refs";
import { EvidenceView } from "@/features/evidence/evidence-view";

export const metadata = { title: "Evidence" };

export default async function EvidencePage({ params }: PageProps<"/projects/[projectId]/evidence">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const [refs, items] = await Promise.all([loadProjectRefs(ctx, projectId), evidenceService.list(ctx, projectId)]);
  return (
    <Suspense>
      <EvidenceView refs={refs} items={items} />
    </Suspense>
  );
}

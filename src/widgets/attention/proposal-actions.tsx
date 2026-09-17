"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import type { ActionResult } from "@/server/core/action";
import { acceptProposalAction, rejectProposalAction } from "@/server/modules/proposals/actions";
import { Button } from "@/shared/ui";

export function ProposalActions({ proposalId, projectId }: { proposalId: string; projectId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"accept" | "reject" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run(kind: "accept" | "reject", fn: () => Promise<ActionResult<unknown>>) {
    setPending(kind);
    setError(null);
    const res = await fn();
    setPending(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="primary"
          data-testid="accept-proposal"
          loading={pending === "accept"}
          disabled={pending !== null}
          onClick={() => run("accept", () => acceptProposalAction({ id: proposalId }))}
        >
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="edit-accept-proposal"
          disabled={pending !== null}
          onClick={() => router.push(`/projects/${projectId}/decisions?proposal=${proposalId}`)}
        >
          Edit and accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="reject-proposal"
          loading={pending === "reject"}
          disabled={pending !== null}
          onClick={() => run("reject", () => rejectProposalAction({ id: proposalId }))}
        >
          Reject
        </Button>
      </div>
      {error && <span className="text-caption text-tag-red">{error}</span>}
    </div>
  );
}

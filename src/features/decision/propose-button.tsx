"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { runProposalPassAction } from "@/server/modules/proposals/actions";
import { Button } from "@/shared/ui";

/** Runs the Proposal pass now (it also runs after new Evidence and Comments); reports the outcome inline. */
export function ProposeButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {note && <span className="text-caption text-ink-subtle">{note}</span>}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        loading={pending}
        data-testid="propose-from-evidence"
        onClick={async () => {
          setPending(true);
          setNote(null);
          const res = await runProposalPassAction({ projectId });
          setPending(false);
          if (!res.ok) return setNote(res.error);
          const out = res.data;
          setNote(
            "skipped" in out
              ? out.skipped === "nothing_new"
                ? "Nothing new to read"
                : out.skipped === "not_configured"
                  ? "Assistant not configured"
                  : "Pass failed"
              : `${out.proposed} proposed from ${out.sourcesPassed} source${out.sourcesPassed === 1 ? "" : "s"}`,
          );
          router.refresh();
        }}
      >
        <Sparkles className="size-3.5" /> Propose from evidence
      </Button>
    </span>
  );
}

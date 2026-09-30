"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import type { ActionResult } from "@/server/core/action";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import { acceptItemProposalAction, rejectItemProposalAction } from "@/server/modules/proposals/actions";
import type { ProposedMilestoneFields, ProposedTaskFields } from "@/server/modules/proposals/schema";
import type { ReviewableItem } from "@/server/modules/proposals/service";
import { Button } from "@/shared/ui";
import { MilestoneDialog } from "@/features/milestone/milestone-dialog";
import { TaskDialog } from "@/features/task/task-dialog";

/**
 * Accept, Edit and accept, Reject for one item Proposal (#115). Edit and accept opens the Task or
 * Milestone dialog in place, prefilled with what one click would create; saving it accepts.
 */
export function ItemProposalActions({ item, refs }: { item: ReviewableItem; refs: ProjectRefs }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"accept" | "reject" | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run(kind: "accept" | "reject", fn: () => Promise<ActionResult<unknown>>) {
    setPending(kind);
    setError(null);
    const res = await fn();
    setPending(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  // The dialog closes on cancel and on a successful accept alike; a refresh is harmless after either.
  const close = () => {
    setEditing(false);
    router.refresh();
  };
  const projectId = refs.project.id;
  // A payload the create schema refuses still opens the dialog, prefilled with what it has, to be fixed.
  const accept = item.acceptInput;
  const task = item.fields as ProposedTaskFields;
  const milestone = item.fields as ProposedMilestoneFields;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="primary"
          data-testid="accept-item-proposal"
          loading={pending === "accept"}
          disabled={pending !== null || !accept}
          onClick={() => run("accept", () => acceptItemProposalAction({ id: item.id }))}
        >
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="edit-accept-item-proposal"
          disabled={pending !== null}
          onClick={() => setEditing(true)}
        >
          Edit and accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="reject-item-proposal"
          loading={pending === "reject"}
          disabled={pending !== null}
          onClick={() => run("reject", () => rejectItemProposalAction({ id: item.id }))}
        >
          Reject
        </Button>
      </div>
      {error && <span className="text-caption text-tag-red">{error}</span>}
      {item.kind === "task" ? (
        <TaskDialog
          open={editing}
          onClose={close}
          refs={refs}
          proposal={{
            id: item.id,
            defaults:
              accept?.kind === "task"
                ? accept.input
                : {
                    projectId,
                    title: task.title,
                    description: task.description,
                    priority: "none",
                    dueDate: task.dueDate,
                  },
          }}
        />
      ) : (
        <MilestoneDialog
          open={editing}
          onClose={close}
          refs={refs}
          proposal={{
            id: item.id,
            defaults:
              accept?.kind === "milestone"
                ? accept.input
                : { projectId, name: milestone.name, description: milestone.description, dueDate: milestone.dueDate },
          }}
        />
      )}
    </div>
  );
}

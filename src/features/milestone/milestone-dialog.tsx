"use client";

import { Trash2 } from "lucide-react";
import * as React from "react";
import type { DependencyRow } from "@/server/modules/dependencies/schema";
import {
  createMilestoneAction,
  deleteMilestoneAction,
  updateMilestoneAction,
} from "@/server/modules/milestones/actions";
import type { MilestoneRow } from "@/server/modules/milestones/schema";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import { ActionForm, Button, Dialog, FormRow, SelectField, TextField, TextareaField } from "@/shared/ui";
import { DependencyEditor } from "@/features/dependency/dependency-editor";

export function MilestoneDialog({
  open,
  onClose,
  refs,
  milestone,
  tasks,
  dependencies,
}: {
  open: boolean;
  onClose: () => void;
  refs: ProjectRefs;
  milestone?: MilestoneRow | null;
  tasks: TaskListItem[];
  dependencies: DependencyRow[];
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const m = milestone;
  const statuses = refs.statuses.filter((s) => s.scope === "milestone");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={m ? "Milestone" : "New milestone"}
      description={m ? undefined : "A dated checkpoint tasks roll up to."}
      className="max-w-xl"
    >
      {confirmDelete && m ? (
        <ActionForm
          action={deleteMilestoneAction}
          hidden={{ id: m.id, projectId: m.projectId }}
          submitLabel="Delete milestone"
          danger
          cancel={() => setConfirmDelete(false)}
          onSuccess={onClose}
        >
          <p className="text-body-sm text-ink-muted">
            Delete <span className="font-medium text-ink">{m.name}</span>? Tasks stay but lose their milestone;
            dependencies on it are removed.
          </p>
        </ActionForm>
      ) : (
        <ActionForm
          key={m?.id ?? "new"}
          action={m ? updateMilestoneAction : createMilestoneAction}
          hidden={m ? { id: m.id } : { projectId: refs.project.id }}
          submitLabel={m ? "Save changes" : "Create milestone"}
          cancel={onClose}
          onSuccess={onClose}
          footerStart={
            m && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-tag-red hover:text-tag-red"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            )
          }
        >
          <TextField name="name" label="Name" required autoFocus defaultValue={m?.name} placeholder="UAT begins" />
          <TextareaField name="description" label="Description" defaultValue={m?.description ?? ""} />
          <FormRow>
            <TextField name="dueDate" label="Due date" type="date" required defaultValue={m?.dueDate} />
            <SelectField
              name="statusId"
              label="Status"
              defaultValue={m?.statusId ?? statuses.find((s) => s.isDefault)?.id}
              options={statuses.map((s) => ({ value: s.id, label: s.name }))}
            />
          </FormRow>
          <SelectField
            name="ownerId"
            label="Owner"
            defaultValue={m?.ownerId ?? ""}
            placeholder="No owner"
            options={refs.people.map((p) => ({ value: p.id, label: p.name }))}
          />
          {m && (
            <DependencyEditor
              projectId={refs.project.id}
              item={{ type: "milestone", id: m.id }}
              tasks={tasks}
              milestones={refs.milestones}
              dependencies={dependencies}
            />
          )}
        </ActionForm>
      )}
    </Dialog>
  );
}

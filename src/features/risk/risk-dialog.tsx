"use client";

import { Trash2 } from "lucide-react";
import * as React from "react";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import { createRiskAction, deleteRiskAction, updateRiskAction } from "@/server/modules/risks/actions";
import type { RiskRow } from "@/server/modules/risks/schema";
import { SCALE_LEVELS } from "@/shared/domain";
import { ActionForm, Button, Dialog, FormRow, SelectField, TextField, TextareaField, enumOptions } from "@/shared/ui";

export function RiskDialog({
  open,
  onClose,
  refs,
  risk,
}: {
  open: boolean;
  onClose: () => void;
  refs: ProjectRefs;
  risk?: RiskRow | null;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const r = risk;
  const statuses = refs.statuses.filter((s) => s.scope === "risk");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={r ? `R-${r.number}` : "New risk"}
      description={r ? undefined : "Something that may go wrong, with cause, impact and an owner."}
      className="max-w-2xl"
    >
      {confirmDelete && r ? (
        <ActionForm
          action={deleteRiskAction}
          hidden={{ id: r.id, projectId: r.projectId }}
          submitLabel="Delete risk"
          danger
          cancel={() => setConfirmDelete(false)}
          onSuccess={onClose}
        >
          <p className="text-body-sm text-ink-muted">
            Delete <span className="font-medium text-ink">{r.title}</span>? This cannot be undone.
          </p>
        </ActionForm>
      ) : (
        <ActionForm
          key={r?.id ?? "new"}
          action={r ? updateRiskAction : createRiskAction}
          hidden={r ? { id: r.id } : { projectId: refs.project.id }}
          submitLabel={r ? "Save changes" : "Create risk"}
          cancel={onClose}
          onSuccess={onClose}
        >
          <TextField
            name="title"
            label="Title"
            required
            autoFocus
            defaultValue={r?.title}
            placeholder="Vendor access delay blocks testing"
          />
          <FormRow>
            <TextareaField
              name="cause"
              label="Cause"
              defaultValue={r?.cause ?? ""}
              placeholder="Why might this happen?"
              inputClassName="min-h-16"
            />
            <TextareaField
              name="impactDescription"
              label="Impact"
              defaultValue={r?.impactDescription ?? ""}
              placeholder="What happens if it does?"
              inputClassName="min-h-16"
            />
          </FormRow>
          <FormRow>
            <SelectField
              name="probability"
              label="Probability"
              defaultValue={r?.probability ?? "medium"}
              options={enumOptions(SCALE_LEVELS)}
            />
            <SelectField
              name="impact"
              label="Impact level"
              defaultValue={r?.impact ?? "medium"}
              options={enumOptions(SCALE_LEVELS)}
            />
          </FormRow>
          <FormRow>
            <SelectField
              name="statusId"
              label="Status"
              defaultValue={r?.statusId ?? statuses.find((s) => s.isDefault)?.id}
              options={statuses.map((s) => ({ value: s.id, label: s.name }))}
            />
            <SelectField
              name="ownerId"
              label="Owner"
              defaultValue={r?.ownerId ?? ""}
              placeholder="No owner"
              options={refs.people.map((p) => ({ value: p.id, label: p.name }))}
            />
          </FormRow>
          <TextareaField
            name="mitigation"
            label="Mitigation"
            defaultValue={r?.mitigation ?? ""}
            placeholder="What are we doing about it?"
          />
          <FormRow>
            <TextField name="reviewDate" label="Review date" type="date" defaultValue={r?.reviewDate ?? ""} />
          </FormRow>
          <TextareaField
            name="description"
            label="Notes"
            defaultValue={r?.description ?? ""}
            inputClassName="min-h-14"
          />
          {r && (
            <div className="-mb-9 flex">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-tag-red hover:text-tag-red"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
          )}
        </ActionForm>
      )}
    </Dialog>
  );
}

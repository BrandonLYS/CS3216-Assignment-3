"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createLabelAction, deleteLabelAction, updateLabelAction } from "@/server/modules/labels/actions";
import type { LabelRow } from "@/server/modules/labels/schema";
import { deleteProjectAction, updateProjectAction } from "@/server/modules/projects/actions";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import { HEALTH_LEVELS, PROJECT_STATUSES } from "@/shared/domain";
import {
  ActionForm,
  Button,
  Dialog,
  FormRow,
  Panel,
  SectionTitle,
  SelectField,
  TextField,
  TextareaField,
  enumOptions,
} from "@/shared/ui";
import { StatusManager } from "./status-manager";

export function ProjectSettings({ refs }: { refs: ProjectRefs }) {
  const { project } = refs;
  const router = useRouter();
  const [labelModal, setLabelModal] = React.useState<{ label?: LabelRow; deleting?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 p-6">
        <section className="flex flex-col gap-4">
          <SectionTitle>Details</SectionTitle>
          <Panel className="p-5">
            <ActionForm
              action={updateProjectAction}
              hidden={{ id: project.id }}
              submitLabel={saved ? "Saved" : "Save changes"}
              onSuccess={() => {
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              }}
            >
              <FormRow>
                <TextField name="name" label="Name" required defaultValue={project.name} />
                <TextField
                  name="key"
                  label="Key"
                  required
                  defaultValue={project.key}
                  maxLength={6}
                  inputClassName="uppercase"
                  hint="Changes future and existing task IDs"
                />
              </FormRow>
              <TextareaField name="description" label="Description" defaultValue={project.description ?? ""} />
              <FormRow>
                <SelectField
                  name="status"
                  label="Status"
                  defaultValue={project.status}
                  options={enumOptions(PROJECT_STATUSES)}
                />
                <SelectField
                  name="health"
                  label="Health"
                  defaultValue={project.health}
                  options={enumOptions(HEALTH_LEVELS)}
                  hint="Your manual RAG call for now"
                />
              </FormRow>
              <FormRow>
                <TextField name="startDate" label="Start date" type="date" defaultValue={project.startDate ?? ""} />
                <TextField name="targetDate" label="Target date" type="date" defaultValue={project.targetDate ?? ""} />
              </FormRow>
            </ActionForm>
          </Panel>
        </section>

        <StatusManager projectId={project.id} statuses={refs.statuses} />

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <SectionTitle>Labels</SectionTitle>
              <p className="mt-1 text-caption text-ink-subtle">Free-form tags for filtering tasks.</p>
            </div>
            <Button size="sm" onClick={() => setLabelModal({})}>
              <Plus className="size-3.5" /> Add label
            </Button>
          </div>
          <Panel className="divide-y divide-hairline/60">
            {refs.labels.length === 0 && (
              <p className="px-4 py-6 text-center text-caption text-ink-subtle">No labels yet.</p>
            )}
            {refs.labels.map((l) => (
              <div key={l.id} className="group flex items-center gap-3 px-4 py-2">
                <span className="size-2.5 rounded-full" style={{ background: l.color }} />
                <span className="flex-1 text-body-sm text-ink">{l.name}</span>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="icon" variant="ghost" onClick={() => setLabelModal({ label: l })} aria-label="Edit">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setLabelModal({ label: l, deleting: true })}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3.5 text-tag-red" />
                  </Button>
                </div>
              </div>
            ))}
          </Panel>
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle className="text-tag-red">Danger zone</SectionTitle>
          <Panel className="flex items-center justify-between border-tag-red/30 p-5">
            <div>
              <p className="text-body-sm text-ink">Delete this project</p>
              <p className="text-caption text-ink-subtle">
                Removes all tasks, milestones, risks, evidence and history. Irreversible.
              </p>
            </div>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete project
            </Button>
          </Panel>
        </section>
      </div>

      <Dialog
        open={labelModal !== null && !labelModal.deleting}
        onClose={() => setLabelModal(null)}
        title={labelModal?.label ? "Edit label" : "New label"}
      >
        {labelModal && !labelModal.deleting && (
          <ActionForm
            key={labelModal.label?.id ?? "new"}
            action={labelModal.label ? updateLabelAction : createLabelAction}
            hidden={labelModal.label ? { id: labelModal.label.id } : { projectId: project.id }}
            submitLabel={labelModal.label ? "Save" : "Add label"}
            cancel={() => setLabelModal(null)}
            onSuccess={() => setLabelModal(null)}
          >
            <TextField
              name="name"
              label="Name"
              required
              autoFocus
              defaultValue={labelModal.label?.name}
              placeholder="backend"
            />
            <TextField
              name="color"
              label="Colour"
              type="color"
              defaultValue={labelModal.label?.color ?? "#4ea7fc"}
              inputClassName="h-9 w-16 p-1"
            />
          </ActionForm>
        )}
      </Dialog>

      <Dialog open={Boolean(labelModal?.deleting)} onClose={() => setLabelModal(null)} title="Delete label">
        {labelModal?.deleting && labelModal.label && (
          <ActionForm
            action={deleteLabelAction}
            hidden={{ id: labelModal.label.id, projectId: project.id }}
            submitLabel="Delete"
            danger
            cancel={() => setLabelModal(null)}
            onSuccess={() => setLabelModal(null)}
          >
            <p className="text-body-sm text-ink-muted">
              Delete label <span className="font-medium text-ink">{labelModal.label.name}</span>? It is removed from all
              tasks.
            </p>
          </ActionForm>
        )}
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete project">
        <ActionForm
          action={deleteProjectAction}
          hidden={{ id: project.id }}
          submitLabel="Delete everything"
          danger
          cancel={() => setConfirmDelete(false)}
          onSuccess={() => router.push("/projects")}
        >
          <p className="text-body-sm text-ink-muted">
            Type the project key <span className="font-mono text-ink">{project.key}</span> to confirm.
          </p>
          <TextField
            name="confirm"
            label="Project key"
            required
            pattern={project.key}
            autoFocus
            placeholder={project.key}
            inputClassName="uppercase"
          />
        </ActionForm>
      </Dialog>
    </div>
  );
}

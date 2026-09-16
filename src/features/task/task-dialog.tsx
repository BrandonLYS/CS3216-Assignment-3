"use client";

import { Trash2 } from "lucide-react";
import * as React from "react";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import type { DependencyRow } from "@/server/modules/dependencies/schema";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/server/modules/tasks/actions";
import { PRIORITIES } from "@/shared/domain";
import { ActionForm, Button, Dialog, FormRow, SelectField, TextField, TextareaField, enumOptions } from "@/shared/ui";
import { useFieldError } from "@/shared/ui/action-form";
import { CommentThread } from "@/features/comment/comment-thread";
import { DependencyEditor } from "@/features/dependency/dependency-editor";
import { ItemDialogTabs } from "@/features/history/item-dialog-tabs";

export function TaskDialog({
  open,
  onClose,
  refs,
  task,
  tasks,
  dependencies,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  refs: ProjectRefs;
  /** Present when editing. */
  task?: TaskListItem | null;
  tasks: TaskListItem[];
  dependencies: DependencyRow[];
  /** Pre-fill for create (e.g. status from a board column). */
  defaults?: { statusId?: string; milestoneId?: string };
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const t = task?.task;
  const taskStatuses = refs.statuses.filter((s) => s.scope === "task");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t ? `${refs.project.key}-${t.number}` : "New task"}
      description={t ? undefined : "Tasks are the units of work inside this project."}
      className="max-w-2xl"
    >
      {confirmDelete && t ? (
        <ActionForm
          action={deleteTaskAction}
          hidden={{ id: t.id, projectId: t.projectId }}
          submitLabel="Delete task"
          danger
          cancel={() => setConfirmDelete(false)}
          onSuccess={onClose}
        >
          <p className="text-body-sm text-ink-muted">
            Delete <span className="font-medium text-ink">{t.title}</span>? Its dependencies are removed too. This
            cannot be undone.
          </p>
        </ActionForm>
      ) : (
        <ItemDialogTabs history={t ? { projectId: t.projectId, entityType: "task", entityId: t.id } : null}>
          <ActionForm
            key={t?.id ?? "new"}
            action={t ? updateTaskAction : createTaskAction}
            hidden={t ? { id: t.id } : { projectId: refs.project.id }}
            submitLabel={t ? "Save changes" : "Create task"}
            cancel={onClose}
            onSuccess={onClose}
            footerStart={
              t && (
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
            <TextField
              name="title"
              label="Title"
              required
              autoFocus
              defaultValue={t?.title}
              placeholder="What needs to happen?"
            />
            <TextareaField
              name="description"
              label="Description"
              defaultValue={t?.description ?? ""}
              placeholder="Context, acceptance criteria, links…"
            />
            <FormRow>
              <SelectField
                name="statusId"
                label="Status"
                defaultValue={t?.statusId ?? defaults?.statusId ?? taskStatuses.find((s) => s.isDefault)?.id}
                options={taskStatuses.map((s) => ({ value: s.id, label: s.name }))}
              />
              <SelectField
                name="priority"
                label="Priority"
                defaultValue={t?.priority ?? "none"}
                options={enumOptions(PRIORITIES)}
              />
            </FormRow>
            <FormRow>
              <SelectField
                name="assigneeId"
                label="Owner"
                defaultValue={t?.assigneeId ?? ""}
                placeholder="Unassigned"
                options={refs.people.map((p) => ({ value: p.id, label: p.name }))}
              />
              <SelectField
                name="teamId"
                label="Team"
                defaultValue={t?.teamId ?? ""}
                placeholder="No team"
                options={refs.teams.map((x) => ({ value: x.id, label: x.name }))}
              />
            </FormRow>
            <FormRow>
              <SelectField
                name="milestoneId"
                label="Milestone"
                defaultValue={t?.milestoneId ?? defaults?.milestoneId ?? ""}
                placeholder="No milestone"
                options={refs.milestones.map((m) => ({ value: m.id, label: m.name }))}
              />
              <TextField
                name="estimateHours"
                label="Estimate (hours)"
                type="number"
                min={0}
                step={0.5}
                defaultValue={t?.estimateHours ?? ""}
              />
            </FormRow>
            <FormRow>
              <TextField name="startDate" label="Start date" type="date" defaultValue={t?.startDate ?? ""} />
              <TextField name="dueDate" label="Due date" type="date" defaultValue={t?.dueDate ?? ""} />
            </FormRow>
            <LabelPicker labels={refs.labels} selected={task?.labels.map((l) => l.id) ?? []} />

            {t && (
              <>
                <DependencyEditor
                  projectId={refs.project.id}
                  item={{ type: "task", id: t.id }}
                  tasks={tasks}
                  milestones={refs.milestones}
                  dependencies={dependencies}
                />
                <CommentThread projectId={refs.project.id} entityType="task" entityId={t.id} people={refs.people} />
              </>
            )}
          </ActionForm>
        </ItemDialogTabs>
      )}
    </Dialog>
  );
}

function LabelPicker({ labels, selected }: { labels: ProjectRefs["labels"]; selected: string[] }) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set(selected));
  const error = useFieldError("labelIds");
  if (!labels.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-medium text-ink-subtle">Labels</span>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((l) => {
          const on = picked.has(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() =>
                setPicked((s) => {
                  const n = new Set(s);
                  if (n.has(l.id)) n.delete(l.id);
                  else n.add(l.id);
                  return n;
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption transition-colors"
              style={{
                borderColor: on ? l.color : "var(--color-hairline)",
                color: on ? "var(--color-ink)" : "var(--color-ink-subtle)",
                background: on ? `${l.color}22` : "transparent",
              }}
            >
              <span className="size-1.5 rounded-full" style={{ background: l.color }} />
              {l.name}
            </button>
          );
        })}
      </div>
      {/* Always submit the key so clearing all labels works; the schema treats "" as an empty list. */}
      {picked.size === 0 ? (
        <input type="hidden" name="labelIds" value="" />
      ) : (
        [...picked].map((id) => <input key={id} type="hidden" name="labelIds" value={id} />)
      )}
      {error && <span className="text-caption text-tag-red">{error}</span>}
    </div>
  );
}

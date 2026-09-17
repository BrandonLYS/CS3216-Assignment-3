"use client";

import { Trash2 } from "lucide-react";
import * as React from "react";
import {
  createDecisionAction,
  deleteDecisionAction,
  supersedeDecisionAction,
  updateDecisionAction,
} from "@/server/modules/decisions/actions";
import type { SourceCandidates } from "@/server/modules/decisions/repository";
import type { DecisionListItem } from "@/server/modules/decisions/service";
import type { DependencyRow } from "@/server/modules/dependencies/schema";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import { ActionForm, Button, Dialog, FormRow, SelectField, TextField, TextareaField, enumOptions } from "@/shared/ui";
import { Field, Select } from "@/shared/ui/input";
import { ItemDialogTabs } from "@/features/history/item-dialog-tabs";
import { AssumptionsPanel } from "./assumptions-panel";
import { SourcePicker, type PickedSource } from "./source-picker";

export function DecisionDialog({
  open,
  onClose,
  refs,
  item,
  decisions,
  candidates,
  tasks,
  dependencies,
}: {
  open: boolean;
  onClose: () => void;
  refs: ProjectRefs;
  item?: DecisionListItem | null;
  decisions: DecisionListItem[];
  candidates: SourceCandidates;
  tasks: TaskListItem[];
  dependencies: DependencyRow[];
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const d = item?.decision;
  const [sources, setSources] = React.useState<PickedSource[]>(() =>
    (item?.sources ?? []).map((s) => ({ kind: s.kind, entityId: s.entityId, passageId: s.passageId, label: s.label })),
  );
  const [supersedeError, setSupersedeError] = React.useState<string | null>(null);
  const allAssumptions = React.useMemo(() => {
    const seen = new Map<string, DecisionListItem["assumptions"][number]>();
    for (const x of decisions) for (const a of x.assumptions) seen.set(a.id, a);
    return [...seen.values()];
  }, [decisions]);
  // Candidates for "supersedes": other Decisions not already superseded (except the one this already supersedes).
  const supersedable = decisions.filter(
    (x) => x.decision.id !== d?.id && (x.decision.status !== "superseded" || x.decision.id === item?.supersedesId),
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={d ? `D-${d.number}` : "New decision"}
      description={d ? undefined : "What was chosen, what was rejected and why, and the source it rests on."}
      className="max-w-2xl"
    >
      {confirmDelete && d ? (
        <ActionForm
          action={deleteDecisionAction}
          hidden={{ id: d.id, projectId: d.projectId }}
          submitLabel="Delete decision"
          danger
          cancel={() => setConfirmDelete(false)}
          onSuccess={onClose}
        >
          <p className="text-body-sm text-ink-muted">
            Delete <span className="font-medium text-ink">{d.title}</span>? Assumptions that support nothing else are
            removed with it. This cannot be undone.
          </p>
        </ActionForm>
      ) : (
        <ItemDialogTabs history={d ? { projectId: d.projectId, entityType: "decision", entityId: d.id } : null}>
          <ActionForm
            key={d?.id ?? "new"}
            action={d ? updateDecisionAction : createDecisionAction}
            hidden={d ? { id: d.id } : { projectId: refs.project.id }}
            submitLabel={d ? "Save changes" : "Create decision"}
            cancel={onClose}
            onSuccess={onClose}
            footerStart={
              d && (
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
              defaultValue={d?.title}
              placeholder="Switch from surveys to interviews"
            />
            <FormRow>
              <TextField name="decidedOn" label="Decided on" type="date" required defaultValue={d?.decidedOn ?? ""} />
              <SelectField
                name="ownerId"
                label="Owner"
                defaultValue={d?.ownerId ?? ""}
                placeholder="No owner"
                options={refs.people.map((p) => ({ value: p.id, label: p.name }))}
              />
            </FormRow>
            {d && (
              <FormRow>
                {d.status === "superseded" ? (
                  <Field label="Status" hint={`Superseded by ${supersededByLabel(item, decisions)}`}>
                    <Select disabled value="superseded">
                      <option value="superseded">Superseded</option>
                    </Select>
                  </Field>
                ) : (
                  <SelectField
                    name="status"
                    label="Status"
                    defaultValue={d.status}
                    options={enumOptions(["active", "revisited"])}
                  />
                )}
                <Field label="Supersedes" error={supersedeError ?? undefined}>
                  <Select
                    value={item?.supersedesId ?? ""}
                    onChange={async (e) => {
                      setSupersedeError(null);
                      const res = await supersedeDecisionAction({ id: d.id, supersedesId: e.target.value || null });
                      if (!res.ok) setSupersedeError(res.error);
                    }}
                  >
                    <option value="">Nothing</option>
                    {supersedable.map((x) => (
                      <option key={x.decision.id} value={x.decision.id}>
                        D-{x.decision.number} {x.decision.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormRow>
            )}
            <TextareaField
              name="context"
              label="Context"
              defaultValue={d?.context ?? ""}
              placeholder="What was true at the time?"
              inputClassName="min-h-16"
            />
            <TextareaField
              name="chosen"
              label="Chosen"
              required
              defaultValue={d?.chosen ?? ""}
              placeholder="What we decided to do"
              inputClassName="min-h-16"
            />
            <TextareaField
              name="alternatives"
              label="Alternatives"
              hint="What was rejected, and why"
              defaultValue={d?.alternatives ?? ""}
              inputClassName="min-h-16"
            />
            <FormRow>
              <TextField
                name="revisitWhen"
                label="Revisit when"
                defaultValue={d?.revisitWhen ?? ""}
                placeholder="Response rate drops below 10%"
              />
              {!d && (
                <SelectField
                  name="supersedesId"
                  label="Supersedes"
                  defaultValue=""
                  placeholder="Nothing"
                  options={supersedable.map((x) => ({
                    value: x.decision.id,
                    label: `D-${x.decision.number} ${x.decision.title}`,
                  }))}
                />
              )}
            </FormRow>
            <SourcePicker candidates={candidates} value={sources} onChange={setSources} />
            {d && (
              <AssumptionsPanel
                refs={refs}
                decisionId={d.id}
                attached={item?.assumptions ?? []}
                all={allAssumptions}
                tasks={tasks}
                dependencies={dependencies}
              />
            )}
          </ActionForm>
        </ItemDialogTabs>
      )}
    </Dialog>
  );
}

function supersededByLabel(item: DecisionListItem | null | undefined, decisions: DecisionListItem[]) {
  const by = decisions.find((x) => x.decision.id === item?.supersededById)?.decision;
  return by ? `D-${by.number} ${by.title}` : "a later decision";
}

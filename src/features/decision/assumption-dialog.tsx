"use client";

import * as React from "react";
import { createAssumptionAction } from "@/server/modules/decisions/actions";
import type { DependencyRow } from "@/server/modules/dependencies/schema";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import { ASSUMPTION_SUBTYPES, DATE_TARGET_FIELDS, type AssumptionSubtype } from "@/shared/domain";
import { ActionForm, Dialog, FormRow, SelectField, TextField, TextareaField, enumOptions } from "@/shared/ui";
import { Field, Select } from "@/shared/ui/input";
import { useFieldError } from "@/shared/ui/action-form";

const SUBTYPE_HINT: Record<AssumptionSubtype, string> = {
  date: "Breaks when the Task or Milestone date moves past the date assumed.",
  person: "Breaks when the Person is removed from the Project.",
  dependency: "Breaks when the Dependency becomes blocking.",
  external_rule: "A condition outside the Project; broken only by hand.",
};

/** Label for a Dependency edge, `pred → succ`, from the Project's Tasks and Milestones. */
export function dependencyLabel(d: DependencyRow, refs: ProjectRefs, tasks: TaskListItem[]) {
  const name = (type: string, id: string) =>
    type === "task"
      ? (tasks.find((t) => t.task.id === id)?.task.title ?? "Task")
      : (refs.milestones.find((m) => m.id === id)?.name ?? "Milestone");
  return `${name(d.predecessorType, d.predecessorId)} → ${name(d.successorType, d.successorId)}`;
}

/**
 * Nested dialog that creates one Assumption on a Decision. It is its own Dialog because a
 * nested <form> cannot live inside the Decision ActionForm. The date subtype posts a
 * `milestone:<id>` / `task:<id>` target that is split into `targetType` / `targetId` here.
 */
export function AssumptionDialog({
  open,
  onClose,
  refs,
  decisionId,
  tasks,
  dependencies,
}: {
  open: boolean;
  onClose: () => void;
  refs: ProjectRefs;
  decisionId: string;
  tasks: TaskListItem[];
  dependencies: DependencyRow[];
}) {
  const [subtype, setSubtype] = React.useState<AssumptionSubtype>("date");
  const [target, setTarget] = React.useState("");
  const sep = target.indexOf(":");
  const [targetType, targetId] = sep > 0 ? [target.slice(0, sep), target.slice(sep + 1)] : ["", ""];
  const projectKey = refs.project.key;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New assumption"
      description="A condition this decision rests on, typed by what can later contradict it."
    >
      <ActionForm
        action={createAssumptionAction}
        hidden={{ projectId: refs.project.id, decisionId }}
        submitLabel="Add assumption"
        cancel={onClose}
        onSuccess={onClose}
      >
        <TextareaField
          name="statement"
          label="Statement"
          required
          autoFocus
          placeholder="The dataset arrives before UAT begins"
          inputClassName="min-h-14"
        />
        <SelectField
          name="subtype"
          label="Subtype"
          value={subtype}
          onChange={(e) => {
            setSubtype(e.target.value as AssumptionSubtype);
            setTarget("");
          }}
          options={enumOptions(ASSUMPTION_SUBTYPES)}
          hint={SUBTYPE_HINT[subtype]}
        />
        {subtype === "date" && (
          <>
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <TargetSelect
              label="Target"
              value={target}
              onChange={setTarget}
              groups={[
                {
                  label: "Milestones",
                  options: refs.milestones.map((m) => ({ value: `milestone:${m.id}`, label: m.name })),
                },
                {
                  label: "Tasks",
                  options: tasks.map((t) => ({
                    value: `task:${t.task.id}`,
                    label: `${projectKey}-${t.task.number} ${t.task.title}`,
                  })),
                },
              ]}
            />
            <FormRow>
              {targetType === "task" ? (
                <SelectField
                  name="targetField"
                  label="Which date"
                  options={enumOptions(DATE_TARGET_FIELDS)}
                  defaultValue="dueDate"
                />
              ) : (
                <input type="hidden" name="targetField" value="dueDate" />
              )}
              <TextField name="assumedUntil" label="Assumed until" type="date" required />
            </FormRow>
          </>
        )}
        {subtype === "person" && (
          <>
            <input type="hidden" name="targetType" value="person" />
            <SelectField
              name="targetId"
              label="Person"
              placeholder="Pick a person"
              options={refs.people.map((p) => ({ value: p.id, label: p.name }))}
            />
          </>
        )}
        {subtype === "dependency" && (
          <>
            <input type="hidden" name="targetType" value="dependency" />
            <SelectField
              name="targetId"
              label="Dependency"
              placeholder="Pick a dependency"
              options={dependencies.map((d) => ({ value: d.id, label: dependencyLabel(d, refs, tasks) }))}
            />
          </>
        )}
      </ActionForm>
    </Dialog>
  );
}

function TargetSelect({
  label,
  value,
  onChange,
  groups,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  groups: { label: string; options: { value: string; label: string }[] }[];
}) {
  return (
    <Field label={label} error={useFieldError("targetId")}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Pick a task or milestone</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </Field>
  );
}

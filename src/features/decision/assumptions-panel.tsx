"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import type { ActionResult } from "@/server/core/action";
import {
  attachAssumptionAction,
  detachAssumptionAction,
  retireAssumptionAction,
} from "@/server/modules/decisions/actions";
import type { AssumptionRow } from "@/server/modules/decisions/schema";
import type { DependencyRow } from "@/server/modules/dependencies/schema";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import { labelFor } from "@/shared/domain";
import { fmtDate } from "@/shared/lib/dates";
import { Button, CommandPicker } from "@/shared/ui";
import { ASSUMPTION_ICON } from "@/entities/decision/assumption-chip";
import { AssumptionDialog, dependencyLabel } from "./assumption-dialog";

/** Human label for what an Assumption watches. */
export function targetLabel(a: AssumptionRow, refs: ProjectRefs, tasks: TaskListItem[], dependencies: DependencyRow[]) {
  switch (a.targetType) {
    case "milestone":
      return refs.milestones.find((m) => m.id === a.targetId)?.name ?? "Milestone (deleted)";
    case "task": {
      const t = tasks.find((x) => x.task.id === a.targetId);
      return t
        ? `${refs.project.key}-${t.task.number} ${labelFor(a.targetField ?? "dueDate").toLowerCase()}`
        : "Task (deleted)";
    }
    case "person":
      return refs.people.find((p) => p.id === a.targetId)?.name ?? "Person (removed)";
    case "dependency": {
      const d = dependencies.find((x) => x.id === a.targetId);
      return d ? dependencyLabel(d, refs, tasks) : "Dependency (deleted)";
    }
    default:
      return null;
  }
}

/**
 * "Assumptions" section of the Decision dialog (edit mode). Not a <form>: it sits inside the
 * Decision ActionForm, so writes call the JSON actions and every control is `type="button"`.
 */
export function AssumptionsPanel({
  refs,
  decisionId,
  attached,
  all,
  tasks,
  dependencies,
}: {
  refs: ProjectRefs;
  decisionId: string;
  attached: AssumptionRow[];
  /** Every Assumption in the Project (for "attach existing"). */
  all: AssumptionRow[];
  tasks: TaskListItem[];
  dependencies: DependencyRow[];
}) {
  const [creating, setCreating] = React.useState(false);
  const [attaching, setAttaching] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const attachedIds = new Set(attached.map((a) => a.id));
  const options = all.filter((a) => !attachedIds.has(a.id));

  async function call(fn: () => Promise<ActionResult<unknown>>) {
    setPending(true);
    setError(null);
    const res = await fn();
    setPending(false);
    if (!res.ok) setError(res.error);
    else setAttaching(false);
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-medium text-ink-subtle">Assumptions</span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setAttaching(true)}
            disabled={pending || attaching || !options.length}
            title={options.length ? undefined : "No other assumptions in this project"}
          >
            Attach existing
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(true)} disabled={pending}>
            <Plus className="size-3.5" /> New assumption
          </Button>
        </span>
      </div>
      {attached.length === 0 && !attaching && (
        <p className="px-1 text-caption text-ink-tertiary">Nothing recorded yet. What does this decision rest on?</p>
      )}
      {attached.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline/60">
          {attached.map((a) => {
            const Icon = ASSUMPTION_ICON[a.subtype];
            const target = targetLabel(a, refs, tasks, dependencies);
            const retired = a.state === "retired";
            return (
              <li key={a.id} className="flex items-start gap-2 py-1.5 text-body-sm">
                <Icon className="mt-0.5 size-3.5 shrink-0 text-ink-tertiary" />
                <div className="min-w-0 flex-1">
                  <p className={retired ? "text-ink-tertiary line-through" : "text-ink"}>{a.statement}</p>
                  <p className="text-caption text-ink-tertiary">
                    {labelFor(a.subtype)}
                    {target && ` · ${target}`}
                    {a.assumedUntil && ` · until ${fmtDate(a.assumedUntil, "d MMM yyyy")}`}
                    {a.state !== "holding" && (
                      <span className={a.state === "broken" ? "text-tag-red" : undefined}> · {labelFor(a.state)}</span>
                    )}
                  </p>
                </div>
                {!retired && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => call(() => retireAssumptionAction({ id: a.id }))}
                  >
                    Retire
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    call(() => detachAssumptionAction({ projectId: refs.project.id, decisionId, assumptionId: a.id }))
                  }
                >
                  Detach
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {attaching && (
        <CommandPicker
          items={options.map((a) => ({ id: a.id, label: a.statement, hint: labelFor(a.subtype) }))}
          placeholder="Search assumptions…"
          onPick={(assumptionId) => call(() => attachAssumptionAction({ decisionId, assumptionId }))}
          onCancel={() => setAttaching(false)}
        />
      )}
      {error && <p className="text-caption text-tag-red">{error}</p>}
      <AssumptionDialog
        open={creating}
        onClose={() => setCreating(false)}
        refs={refs}
        decisionId={decisionId}
        tasks={tasks}
        dependencies={dependencies}
      />
    </div>
  );
}

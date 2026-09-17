"use client";

import { Plus, X } from "lucide-react";
import * as React from "react";
import type { ActionResult } from "@/server/core/action";
import { addConsequenceAction, removeConsequenceAction } from "@/server/modules/decisions/actions";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import type { RiskListItem } from "@/server/modules/risks/repository";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import type { ConsequenceType } from "@/shared/domain";
import { Button, CommandPicker } from "@/shared/ui";
import { CONSEQUENCE_ICON } from "@/entities/decision/consequence-icon";

/**
 * "Leads to" section of the Decision dialog: the Tasks, Milestones and Risks this Decision
 * caused (`leads_to` edges). Not a <form>; every control is `type="button"`.
 */
export function ConsequencesPanel({
  refs,
  decisionId,
  consequences,
  tasks,
  risks,
}: {
  refs: ProjectRefs;
  decisionId: string;
  consequences: Array<{ type: ConsequenceType; id: string }>;
  tasks: TaskListItem[];
  risks: RiskListItem[];
}) {
  const [adding, setAdding] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const key = refs.project.key;
  const all = [
    ...refs.milestones.map((m) => ({ type: "milestone" as const, id: m.id, label: m.name, hint: "milestone" })),
    ...tasks.map((t) => ({
      type: "task" as const,
      id: t.task.id,
      label: t.task.title,
      hint: `${key}-${t.task.number}`,
    })),
    ...risks.map((r) => ({ type: "risk" as const, id: r.risk.id, label: r.risk.title, hint: `R-${r.risk.number}` })),
  ];
  const linked = new Set(consequences.map((c) => `${c.type}:${c.id}`));
  const options = all.filter((o) => !linked.has(`${o.type}:${o.id}`));

  async function call(fn: () => Promise<ActionResult<unknown>>) {
    setPending(true);
    setError(null);
    const res = await fn();
    setPending(false);
    if (!res.ok) setError(res.error);
    else setAdding(false);
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <span className="text-caption font-medium text-ink-subtle">
          Leads to <span className="font-normal text-ink-tertiary">· what follows from this decision</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setAdding(true)}
          disabled={pending || adding || !options.length}
        >
          <Plus className="size-3.5" /> Add item
        </Button>
      </div>
      {consequences.length === 0 && !adding && (
        <p className="px-1 text-caption text-ink-tertiary">No consequences recorded</p>
      )}
      {consequences.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {consequences.map((c) => {
            const o = all.find((x) => x.type === c.type && x.id === c.id);
            const Icon = CONSEQUENCE_ICON[c.type];
            return (
              <span
                key={`${c.type}:${c.id}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-surface-2 py-0.5 pr-1 pl-2 text-caption text-ink"
              >
                <Icon className="size-3 shrink-0 text-ink-tertiary" />
                <span className="truncate">{o?.label ?? `${c.type} (deleted)`}</span>
                <button
                  type="button"
                  aria-label={`Remove ${o?.label ?? c.id}`}
                  disabled={pending}
                  onClick={() =>
                    call(() => removeConsequenceAction({ decisionId, targetType: c.type, targetId: c.id }))
                  }
                  className="rounded-sm p-0.5 text-ink-tertiary hover:text-ink"
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {adding && (
        <CommandPicker
          items={options.map((o) => ({ id: `${o.type}:${o.id}`, label: o.label, hint: o.hint, keywords: [o.hint] }))}
          placeholder="Search tasks, milestones and risks…"
          onPick={(id) => {
            const sep = id.indexOf(":");
            const targetType = id.slice(0, sep) as ConsequenceType;
            void call(() => addConsequenceAction({ decisionId, targetType, targetId: id.slice(sep + 1) }));
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {error && <p className="text-caption text-tag-red">{error}</p>}
    </div>
  );
}

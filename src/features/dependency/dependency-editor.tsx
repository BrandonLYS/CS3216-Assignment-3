"use client";

import { ArrowRight, Diamond, Plus, X } from "lucide-react";
import * as React from "react";
import type { DependencyRow } from "@/server/modules/dependencies/schema";
import { createDependencyAction, deleteDependencyAction } from "@/server/modules/dependencies/actions";
import type { MilestoneRow } from "@/server/modules/milestones/schema";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import type { DependencyItemType } from "@/shared/domain";
import { Button, Select } from "@/shared/ui";

type ItemRef = { type: DependencyItemType; id: string };

/** Lists predecessors/successors of one item and lets the user add or remove edges. */
export function DependencyEditor({
  projectId,
  item,
  tasks,
  milestones,
  dependencies,
}: {
  projectId: string;
  item: ItemRef;
  tasks: TaskListItem[];
  milestones: MilestoneRow[];
  dependencies: DependencyRow[];
}) {
  const [adding, setAdding] = React.useState<"predecessor" | "successor" | null>(null);
  const [target, setTarget] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const nameOf = (type: DependencyItemType, id: string) =>
    type === "task"
      ? (tasks.find((t) => t.task.id === id)?.task.title ?? "Deleted task")
      : (milestones.find((m) => m.id === id)?.name ?? "Deleted milestone");

  const predecessors = dependencies.filter((d) => d.successorId === item.id);
  const successors = dependencies.filter((d) => d.predecessorId === item.id);

  const options = [
    ...milestones.filter((m) => m.id !== item.id).map((m) => ({ value: `milestone:${m.id}`, label: `◆ ${m.name}` })),
    ...tasks.filter((t) => t.task.id !== item.id).map((t) => ({ value: `task:${t.task.id}`, label: t.task.title })),
  ];

  function openAdd(side: "predecessor" | "successor") {
    setTarget("");
    setError(null);
    setAdding(side);
  }

  // Not a <form>: this editor renders inside the Task/Milestone ActionForm and nested forms
  // would bubble submit into the parent save handler.
  async function add() {
    if (!target) return;
    const [type, id] = target.split(":") as [DependencyItemType, string];
    setPending(true);
    setError(null);
    const res = await createDependencyAction(
      adding === "predecessor"
        ? { projectId, predecessorType: type, predecessorId: id, successorType: item.type, successorId: item.id }
        : { projectId, predecessorType: item.type, predecessorId: item.id, successorType: type, successorId: id },
    );
    setPending(false);
    if (!res.ok) return setError(res.error);
    setAdding(null);
  }

  async function remove(id: string) {
    setPending(true);
    await deleteDependencyAction({ id, projectId });
    setPending(false);
  }

  const Row = ({ d, side }: { d: DependencyRow; side: "predecessor" | "successor" }) => {
    const type = side === "predecessor" ? d.predecessorType : d.successorType;
    const id = side === "predecessor" ? d.predecessorId : d.successorId;
    return (
      <li className="flex items-center gap-2 rounded-sm px-2 py-1 text-caption text-ink-muted hover:bg-surface-3">
        {type === "milestone" ? (
          <Diamond className="size-3 text-ink-subtle" />
        ) : (
          <ArrowRight className="size-3 text-ink-subtle" />
        )}
        <span className="flex-1 truncate">{nameOf(type, id)}</span>
        <button
          type="button"
          onClick={() => remove(d.id)}
          disabled={pending}
          className="text-ink-tertiary hover:text-tag-red"
          aria-label="Remove dependency"
        >
          <X className="size-3" />
        </button>
      </li>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-3 rounded-md border border-hairline bg-surface-1 p-3">
      {(["predecessor", "successor"] as const).map((side) => {
        const list = side === "predecessor" ? predecessors : successors;
        return (
          <div key={side} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-caption font-medium text-ink-subtle">
                {side === "predecessor" ? "Blocked by" : "Blocks"}
              </span>
              <button
                type="button"
                onClick={() => openAdd(side)}
                className="rounded-xs p-0.5 text-ink-tertiary hover:bg-surface-3 hover:text-ink"
                aria-label={`Add ${side}`}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            {list.length === 0 && adding !== side && <p className="px-2 py-1 text-caption text-ink-tertiary">None</p>}
            <ul>
              {list.map((d) => (
                <Row key={d.id} d={d} side={side} />
              ))}
            </ul>
            {adding === side && (
              <div className="flex items-center gap-1.5 pt-1">
                <Select
                  className="h-7 text-caption"
                  autoFocus
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void add();
                    }
                  }}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Button type="button" size="sm" variant="primary" loading={pending} disabled={!target} onClick={add}>
                  Add
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
                  <X className="size-3" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {error && <p className="col-span-2 text-caption text-tag-red">{error}</p>}
    </div>
  );
}

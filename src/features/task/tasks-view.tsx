"use client";

import { Columns3, List, Plus, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import type { DependencyRow } from "@/server/modules/dependencies/schema";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import { TERMINAL_CATEGORIES } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";
import { Button, Input, Select } from "@/shared/ui";
import { TaskBoard } from "./task-board";
import { TaskDialog } from "./task-dialog";
import { TaskList } from "./task-list";

export function TasksView({
  refs,
  tasks,
  dependencies,
}: {
  refs: ProjectRefs;
  tasks: TaskListItem[];
  dependencies: DependencyRow[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const openTaskId = params.get("task");

  const [view, setView] = React.useState<"list" | "board">("list");
  const [q, setQ] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [milestone, setMilestone] = React.useState("");
  const [showDone, setShowDone] = React.useState(true);
  const [creating, setCreating] = React.useState<null | { statusId?: string }>(null);

  const openTask = tasks.find((t) => t.task.id === openTaskId) ?? null;
  const close = () => {
    setCreating(null);
    if (openTaskId) router.replace(`/projects/${refs.project.id}/tasks`, { scroll: false });
  };
  const open = (id: string) => router.replace(`/projects/${refs.project.id}/tasks?task=${id}`, { scroll: false });

  const filtered = tasks.filter((t) => {
    if (q && !`${refs.project.key}-${t.task.number} ${t.task.title}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    if (assignee === "none" ? t.task.assigneeId : assignee && t.task.assigneeId !== assignee) return false;
    if (milestone === "none" ? t.task.milestoneId : milestone && t.task.milestoneId !== milestone) return false;
    if (!showDone && TERMINAL_CATEGORIES.has(t.status.category)) return false;
    return true;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-hairline px-6 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-tertiary" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter tasks…"
            className="h-7 w-56 pl-8 text-caption"
          />
        </div>
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-7 w-40 text-caption">
          <option value="">Any assignee</option>
          <option value="none">Unassigned</option>
          {refs.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={milestone} onChange={(e) => setMilestone(e.target.value)} className="h-7 w-44 text-caption">
          <option value="">Any milestone</option>
          <option value="none">No milestone</option>
          {refs.milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-caption text-ink-subtle">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="accent-primary"
          />{" "}
          Show done
        </label>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-hairline bg-surface-1 p-0.5">
            {(
              [
                ["list", List],
                ["board", Columns3],
              ] as const
            ).map(([v, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-sm p-1 transition-colors",
                  view === v ? "bg-surface-3 text-ink" : "text-ink-subtle hover:text-ink",
                )}
                aria-label={`${v} view`}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={() => setCreating({})}>
            <Plus className="size-3.5" /> New task
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <TaskList
          refs={refs}
          tasks={filtered}
          onOpen={open}
          onCreateInStatus={(statusId) => setCreating({ statusId })}
        />
      ) : (
        <TaskBoard
          refs={refs}
          tasks={filtered}
          onOpen={open}
          onCreateInStatus={(statusId) => setCreating({ statusId })}
        />
      )}

      <TaskDialog
        open={Boolean(openTask) || creating !== null}
        onClose={close}
        refs={refs}
        task={openTask}
        tasks={tasks}
        dependencies={dependencies}
        defaults={creating ?? undefined}
      />
    </div>
  );
}

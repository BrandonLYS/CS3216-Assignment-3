"use client";

import { Diamond, Plus } from "lucide-react";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import { patchTaskAction } from "@/server/modules/tasks/actions";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import { PRIORITIES, TERMINAL_CATEGORIES, labelFor, type Priority } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";
import { dueLabel } from "@/shared/lib/dates";
import { EmptyState } from "@/shared/ui";
import { InlineSelect } from "@/shared/ui/inline-select";
import { CommentCount } from "@/entities/comment/comment-count";
import { LinkedEvidenceCount } from "@/entities/evidence/evidence-chip";
import { Avatar } from "@/entities/person/avatar";
import { StatusGlyph } from "@/entities/status/status-badge";
import { PriorityIcon } from "@/entities/task/priority";

export function TaskList({
  refs,
  tasks,
  onOpen,
  onCreateInStatus,
}: {
  refs: ProjectRefs;
  tasks: TaskListItem[];
  onOpen: (id: string) => void;
  onCreateInStatus: (statusId: string) => void;
}) {
  const statuses = refs.statuses.filter((s) => s.scope === "task");
  if (tasks.length === 0) {
    return <EmptyState title="No tasks match" description="Try clearing the filters, or create a task." />;
  }
  return (
    <div className="flex-1 overflow-y-auto">
      {statuses.map((s) => {
        const group = tasks.filter((t) => t.task.statusId === s.id);
        if (!group.length) return null;
        return (
          <section key={s.id}>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-surface-1/95 px-6 py-1.5 backdrop-blur">
              <StatusGlyph status={s} />
              <span className="text-caption font-medium text-ink">{s.name}</span>
              <span className="text-caption text-ink-tertiary">{group.length}</span>
              <button
                onClick={() => onCreateInStatus(s.id)}
                className="ml-auto rounded-xs p-0.5 text-ink-tertiary hover:bg-surface-3 hover:text-ink"
                aria-label={`Add task in ${s.name}`}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <ul>
              {group.map((t) => (
                <TaskRow key={t.task.id} item={t} refs={refs} onOpen={() => onOpen(t.task.id)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TaskRow({ item, refs, onOpen }: { item: TaskListItem; refs: ProjectRefs; onOpen: () => void }) {
  const { task, status, assignee, milestone, labels } = item;
  const done = TERMINAL_CATEGORIES.has(status.category);
  const due = dueLabel(task.dueDate, done);
  const taskStatuses = refs.statuses.filter((s) => s.scope === "task");

  return (
    <li
      onClick={onOpen}
      className="group flex min-h-10 cursor-pointer flex-wrap items-center gap-2 border-b border-hairline/60 px-4 py-2 text-body-sm transition-colors hover:bg-surface-1 md:flex-nowrap md:gap-3 md:px-6 md:py-0"
    >
      <InlineSelect
        value={task.priority}
        options={PRIORITIES.map((p) => ({
          value: p,
          label: (
            <span className="flex items-center gap-2">
              <PriorityIcon priority={p} /> {labelFor(p)}
            </span>
          ),
        }))}
        onChange={(priority: Priority) => patchTaskAction({ id: task.id, priority })}
        render={(p) => <PriorityIcon priority={p} />}
      />
      <span className="w-16 shrink-0 font-mono text-caption text-ink-tertiary">
        {refs.project.key}-{task.number}
      </span>
      <InlineSelect
        value={task.statusId}
        options={taskStatuses.map((s) => ({
          value: s.id,
          label: (
            <span className="flex items-center gap-2">
              <StatusGlyph status={s} /> {s.name}
            </span>
          ),
        }))}
        onChange={(statusId) => patchTaskAction({ id: task.id, statusId })}
        render={() => <StatusGlyph status={status} />}
      />
      <span className={cn("min-w-32 flex-1 truncate md:min-w-0", done ? "text-ink-subtle line-through" : "text-ink")}>
        {task.title}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {labels.map((l) => (
          <span
            key={l.id}
            className="rounded-full border px-1.5 py-px text-[10px] text-ink-subtle"
            style={{ borderColor: `${l.color}66` }}
          >
            {l.name}
          </span>
        ))}
      </span>
      <LinkedEvidenceCount count={item.linkedEvidenceCount} className="shrink-0" />
      <CommentCount n={item.commentCount} className="shrink-0" />
      {milestone && (
        <span className="flex shrink-0 items-center gap-1 text-caption text-ink-tertiary">
          <Diamond className="size-2.5" /> {milestone.name}
        </span>
      )}
      <span
        className={cn(
          "w-20 shrink-0 text-right text-caption",
          due.tone === "danger" ? "text-tag-red" : due.tone === "warn" ? "text-tag-orange" : "text-ink-tertiary",
        )}
      >
        {due.text}
      </span>
      <InlineSelect
        value={task.assigneeId ?? ""}
        align="right"
        options={[
          {
            value: "",
            label: (
              <span className="flex items-center gap-2">
                <Avatar /> Unassigned
              </span>
            ),
          },
          ...refs.people.map((p) => ({
            value: p.id,
            label: (
              <span className="flex items-center gap-2">
                <Avatar name={p.name} size="xs" /> {p.name}
              </span>
            ),
          })),
        ]}
        onChange={(assigneeId) => patchTaskAction({ id: task.id, assigneeId: assigneeId || null })}
        render={() => <Avatar name={assignee?.name} />}
      />
    </li>
  );
}

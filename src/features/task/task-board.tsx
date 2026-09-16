"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import { moveTaskAction } from "@/server/modules/tasks/actions";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import { cn } from "@/shared/lib/cn";
import { dueLabel } from "@/shared/lib/dates";
import { CommentCount } from "@/entities/comment/comment-count";
import { LinkedEvidenceCount } from "@/entities/evidence/evidence-chip";
import { Avatar } from "@/entities/person/avatar";
import { StatusGlyph } from "@/entities/status/status-badge";
import { PriorityIcon } from "@/entities/task/priority";

export function TaskBoard({
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
  // Optimistic placement while the server action runs; ignored once the server row has moved on.
  const [moved, setMoved] = React.useState<Record<string, { from: string; to: string }>>({});
  const [over, setOver] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const statusOf = (t: TaskListItem) => {
    const m = moved[t.task.id];
    return m && m.from === t.task.statusId ? m.to : t.task.statusId;
  };

  async function drop(e: React.DragEvent, statusId: string) {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/task-id");
    if (!id) return;
    const t = tasks.find((x) => x.task.id === id);
    if (!t || statusOf(t) === statusId) return;
    setMoved((m) => ({ ...m, [id]: { from: t.task.statusId, to: statusId } }));
    const column = tasks.filter((x) => statusOf(x) === statusId);
    const res = await moveTaskAction({ id, statusId, sortOrder: column.length });
    if (!res.ok) {
      setMoved((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)));
      setError(res.error);
    }
  }

  return (
    <div className="flex flex-1 gap-3 overflow-x-auto p-4">
      {error && (
        <p
          role="alert"
          className="absolute right-4 bottom-4 rounded-md bg-tag-red/10 px-3 py-2 text-caption text-tag-red"
        >
          {error}
        </p>
      )}
      {statuses.map((s) => {
        const column = tasks.filter((t) => statusOf(t) === s.id);
        return (
          <div
            key={s.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s.id);
            }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => drop(e, s.id)}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-lg border border-hairline bg-surface-1/60 transition-colors",
              over === s.id && "border-primary/60 bg-surface-2",
            )}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <StatusGlyph status={s} />
              <span className="text-caption font-medium text-ink">{s.name}</span>
              <span className="text-caption text-ink-tertiary">{column.length}</span>
              <button
                onClick={() => onCreateInStatus(s.id)}
                className="ml-auto rounded-xs p-0.5 text-ink-tertiary hover:bg-surface-3 hover:text-ink"
                aria-label={`Add task in ${s.name}`}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {column.map((t) => {
                const due = dueLabel(t.task.dueDate, s.category === "done" || s.category === "cancelled");
                return (
                  <button
                    key={t.task.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.task.id)}
                    onClick={() => onOpen(t.task.id)}
                    className="flex cursor-grab flex-col gap-2 panel p-3 text-left transition-colors hover:border-hairline-strong hover:bg-surface-2 active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-2 text-caption text-ink-tertiary">
                      <span className="font-mono">
                        {refs.project.key}-{t.task.number}
                      </span>
                      <PriorityIcon priority={t.task.priority} className="ml-auto" />
                    </div>
                    <p className="text-body-sm text-ink">{t.task.title}</p>
                    <div className="flex items-center gap-1.5">
                      {t.labels.map((l) => (
                        <span
                          key={l.id}
                          className="size-1.5 rounded-full"
                          style={{ background: l.color }}
                          title={l.name}
                        />
                      ))}
                      <LinkedEvidenceCount count={t.linkedEvidenceCount} className="ml-auto" />
                      <CommentCount n={t.commentCount} className={cn(t.linkedEvidenceCount === 0 && "ml-auto")} />
                      <span
                        className={cn(
                          "text-caption",
                          t.commentCount === 0 && t.linkedEvidenceCount === 0 && "ml-auto",
                          due.tone === "danger"
                            ? "text-tag-red"
                            : due.tone === "warn"
                              ? "text-tag-orange"
                              : "text-ink-tertiary",
                        )}
                      >
                        {due.text}
                      </span>
                      <Avatar name={t.assignee?.name} size="xs" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

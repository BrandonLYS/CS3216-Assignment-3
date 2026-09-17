"use client";

import { Activity, FileText, MessageSquare, Plus, X } from "lucide-react";
import * as React from "react";
import type { SourceCandidates } from "@/server/modules/decisions/repository";
import type { SourceInput } from "@/server/modules/decisions/validation";
import { labelFor, type SourceKind } from "@/shared/domain";
import { fmtDate } from "@/shared/lib/dates";
import { firstLine } from "@/shared/lib/text";
import { Button, CommandPicker, useActionForm, useFieldError, type CommandPickerItem } from "@/shared/ui";

export interface PickedSource extends SourceInput {
  label: string;
}

const KIND_ICON: Record<SourceKind, typeof FileText> = {
  evidence: FileText,
  comment: MessageSquare,
  activity_event: Activity,
};

/** Flatten the three candidate lists into picker items; the id encodes the kind. */
export function candidateItems(c: SourceCandidates): CommandPickerItem[] {
  return [
    ...c.evidence.map((e) => ({
      id: `evidence:${e.id}`,
      label: e.title,
      hint: labelFor(e.kind),
      keywords: [labelFor(e.kind), "evidence"],
      icon: <FileText className="size-3.5 shrink-0 text-ink-tertiary" />,
    })),
    ...c.comments.map((m) => ({
      id: `comment:${m.id}`,
      label: `${m.saidByName ? `${m.saidByName}: ` : ""}${firstLine(m.body)}`,
      hint: `comment · ${fmtDate(m.saidOn ?? m.createdAt.toISOString(), "d MMM")}`,
      keywords: ["comment", m.saidByName ?? ""],
      icon: <MessageSquare className="size-3.5 shrink-0 text-ink-tertiary" />,
    })),
    ...c.activityEvents.map((a) => ({
      id: `activity_event:${a.id}`,
      label: `${labelFor(a.entityType)} "${a.entityLabel}" ${a.field ? `${labelFor(a.field)} changed` : a.action}`,
      hint: `activity · ${fmtDate(a.occurredAt.toISOString(), "d MMM")}`,
      keywords: ["activity", a.entityLabel],
      icon: <Activity className="size-3.5 shrink-0 text-ink-tertiary" />,
    })),
  ];
}

/**
 * "Sources" section of the Decision form: chips for the Sources chosen so far, an inline picker
 * over the Project's Evidence, Comments and Activity Events, and a hidden JSON field the
 * enclosing ActionForm submits as `sources`. Every control is `type="button"`.
 */
export function SourcePicker({
  candidates,
  value,
  onChange,
}: {
  candidates: SourceCandidates;
  value: PickedSource[];
  onChange: (next: PickedSource[]) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  // The field error belongs to the last submit; hide it as soon as the PM changes the list,
  // and show it again on the next submit (pending flips true) if the server still objects.
  const { pending } = useActionForm();
  const fieldError = useFieldError("sources");
  const [touched, setTouched] = React.useState(false);
  const [wasPending, setWasPending] = React.useState(pending);
  if (pending !== wasPending) {
    setWasPending(pending);
    if (pending) setTouched(false);
  }
  const error = touched ? undefined : fieldError;
  const change = (next: PickedSource[]) => {
    setTouched(true);
    onChange(next);
  };
  const items = React.useMemo(() => candidateItems(candidates), [candidates]);
  const chosen = new Set(value.map((s) => `${s.kind}:${s.entityId}`));
  const options = items.filter((it) => !chosen.has(it.id));

  const pick = (id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const sep = id.indexOf(":");
    const kind = id.slice(0, sep) as SourceKind;
    const entityId = id.slice(sep + 1);
    change([...value, { kind, entityId, label: it.label }]);
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface-1 p-3">
      <input
        type="hidden"
        name="sources"
        value={JSON.stringify(value.map(({ kind, entityId, passageId }) => ({ kind, entityId, passageId })))}
      />
      <div className="flex items-center justify-between">
        <span className="text-caption font-medium text-ink-subtle">
          Sources <span className="font-normal text-ink-tertiary">· at least one</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setAdding(true)}
          disabled={adding || !options.length}
          title={options.length ? undefined : "Nothing left in this project to cite"}
        >
          <Plus className="size-3.5" /> Add source
        </Button>
      </div>
      {value.length === 0 && !adding && (
        <p className="px-1 text-caption text-ink-tertiary">Cite the Evidence, Comment or change this rests on.</p>
      )}
      {value.length > 0 && (
        <ul className="flex flex-col gap-1">
          {value.map((s) => {
            const Icon = KIND_ICON[s.kind];
            return (
              <li
                key={`${s.kind}:${s.entityId}`}
                className="flex items-center gap-2 rounded-sm px-1 py-0.5 text-body-sm text-ink-muted"
              >
                <Icon className="size-3.5 shrink-0 text-ink-tertiary" />
                <span className="truncate">{s.label}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-tertiary">{labelFor(s.kind)}</span>
                <button
                  type="button"
                  aria-label={`Remove source ${s.label}`}
                  onClick={() => change(value.filter((v) => v !== s))}
                  className="rounded-sm p-0.5 text-ink-tertiary hover:text-ink"
                >
                  <X className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <CommandPicker
          items={options}
          placeholder="Search evidence, comments and activity…"
          emptyText="No matches."
          onPick={pick}
          onCancel={() => setAdding(false)}
        />
      )}
      {error && <p className="text-caption text-tag-red">{error}</p>}
    </div>
  );
}

"use client";

import { Activity, ExternalLink, FileText, MessageSquare, Plus, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { SourceCandidates } from "@/server/modules/decisions/repository";
import type { SourceInput } from "@/server/modules/decisions/validation";
import { labelFor, type SourceKind } from "@/shared/domain";
import { fmtDate } from "@/shared/lib/dates";
import { evidenceHref, passageHref } from "@/shared/lib/hrefs";
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

const WHOLE = "whole";
const sourceKey = (s: Pick<SourceInput, "kind" | "entityId" | "passageId">) =>
  `${s.kind}:${s.entityId}:${s.passageId ?? ""}`;

/** How a cited Passage is named after its Evidence title: the speaker, else its position. */
const passageWhere = (p: { speaker: string | null; ordinal: number }) => p.speaker ?? `passage ${p.ordinal + 1}`;

/** Flatten the three candidate lists into picker items; the id encodes the kind. */
export function candidateItems(c: SourceCandidates): CommandPickerItem[] {
  return [
    ...c.evidence.map((e) => ({
      id: `evidence:${e.id}`,
      label: e.title,
      hint: e.passages.length ? `${labelFor(e.kind)} · ${e.passages.length} passages` : labelFor(e.kind),
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

/** Second step for a transcript: the whole item, or one of its Passages (issue #42). */
function passageItems(e: SourceCandidates["evidence"][number]): CommandPickerItem[] {
  return [
    { id: WHOLE, label: "Whole transcript", hint: `${e.passages.length} passages`, keywords: ["whole", "all"] },
    ...e.passages.map((p) => ({
      id: p.id,
      label: firstLine(p.text, 120),
      hint: [p.speaker, p.timestamp].filter(Boolean).join(" · ") || `passage ${p.ordinal + 1}`,
      keywords: [p.speaker ?? "", p.timestamp ?? "", p.text],
    })),
  ];
}

/**
 * "Sources" section of the Decision form: chips for the Sources chosen so far, an inline picker
 * over the Project's Evidence, Comments and Activity Events (a transcript then offers its
 * Passages), and a hidden JSON field the enclosing ActionForm submits as `sources`. Every control
 * is `type="button"`. Evidence chips are labelled live from the candidates, so a Source whose
 * Passage is gone reads as the whole item, and carry an "Open" link the PM can check.
 */
export function SourcePicker({
  projectId,
  candidates,
  value,
  onChange,
}: {
  projectId: string;
  candidates: SourceCandidates;
  value: PickedSource[];
  onChange: (next: PickedSource[]) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [transcript, setTranscript] = React.useState<SourceCandidates["evidence"][number] | null>(null);
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
  const evidenceById = React.useMemo(() => new Map(candidates.evidence.map((e) => [e.id, e])), [candidates]);
  const chosen = new Set(value.map(sourceKey));
  // A transcript stays pickable while it has Passages not yet cited and has not been cited whole.
  const options = items.filter((it) => {
    const sep = it.id.indexOf(":");
    const kind = it.id.slice(0, sep) as SourceKind;
    const entityId = it.id.slice(sep + 1);
    if (chosen.has(sourceKey({ kind, entityId, passageId: null }))) return false;
    const e = kind === "evidence" ? evidenceById.get(entityId) : undefined;
    return !e?.passages.length || e.passages.some((p) => !chosen.has(sourceKey({ kind, entityId, passageId: p.id })));
  });

  const add = (s: PickedSource) => {
    change([...value, s]);
    setAdding(false);
    setTranscript(null);
  };
  const pick = (id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const sep = id.indexOf(":");
    const kind = id.slice(0, sep) as SourceKind;
    const entityId = id.slice(sep + 1);
    const e = kind === "evidence" ? evidenceById.get(entityId) : undefined;
    if (e?.passages.length) return setTranscript(e);
    add({ kind, entityId, label: it.label });
  };
  const pickPassage = (id: string) => {
    if (!transcript) return;
    if (id === WHOLE) return add({ kind: "evidence", entityId: transcript.id, label: transcript.title });
    const p = transcript.passages.find((x) => x.id === id);
    if (!p) return;
    add({
      kind: "evidence",
      entityId: transcript.id,
      passageId: p.id,
      label: `${transcript.title} · ${passageWhere(p)}`,
    });
  };

  /** Live label and link for an Evidence chip; other kinds keep their snapshot label. */
  const describe = (s: PickedSource): { label: string; href: string | null } => {
    if (s.kind !== "evidence") return { label: s.label, href: null };
    const e = evidenceById.get(s.entityId);
    const p = s.passageId ? e?.passages.find((x) => x.id === s.passageId) : undefined;
    if (p && e) return { label: `${e.title} · ${passageWhere(p)}`, href: passageHref(projectId, e.id, p.id) };
    return { label: e?.title ?? s.label, href: evidenceHref(projectId, s.entityId) };
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface-1 p-3">
      <input
        type="hidden"
        name="sources"
        value={JSON.stringify(
          value.map(({ kind, entityId, passageId, excerpt }) => ({ kind, entityId, passageId, excerpt })),
        )}
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
            const { label, href } = describe(s);
            return (
              <li
                key={sourceKey(s)}
                data-testid="source-chip"
                className="flex items-center gap-2 rounded-sm px-1 py-0.5 text-body-sm text-ink-muted"
              >
                <Icon className="size-3.5 shrink-0 text-ink-tertiary" />
                <span className="truncate">{label}</span>
                {href && (
                  <Link
                    href={href}
                    aria-label={`Open source ${label}`}
                    className="shrink-0 text-ink-tertiary hover:text-primary"
                  >
                    <ExternalLink className="size-3" />
                  </Link>
                )}
                <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-tertiary">{labelFor(s.kind)}</span>
                <button
                  type="button"
                  aria-label={`Remove source ${label}`}
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
      {adding && !transcript && (
        <CommandPicker
          items={options}
          placeholder="Search evidence, comments and activity…"
          emptyText="No matches."
          onPick={pick}
          onCancel={() => setAdding(false)}
        />
      )}
      {adding && transcript && (
        <CommandPicker
          items={passageItems(transcript).filter(
            (it) =>
              !chosen.has(
                sourceKey({ kind: "evidence", entityId: transcript.id, passageId: it.id === WHOLE ? null : it.id }),
              ),
          )}
          placeholder={`Which passage of "${transcript.title}"?`}
          emptyText="No passage matches."
          onPick={pickPassage}
          onCancel={() => setTranscript(null)}
        />
      )}
      {error && <p className="text-caption text-tag-red">{error}</p>}
    </div>
  );
}

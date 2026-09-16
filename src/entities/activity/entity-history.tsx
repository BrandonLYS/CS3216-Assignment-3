import { ArrowRight } from "lucide-react";
import type { HistoryEntry } from "@/server/modules/activity/enrich";
import { HISTORY_FIELDS, type HistoryEntityType, type Via } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";
import { fmtDateTime, relative } from "@/shared/lib/dates";
import { ViaBadge } from "./via-badge";

export interface HistoryGroup {
  key: string;
  actorName: string | null;
  via: Via | null;
  occurredAt: string;
  entries: HistoryEntry[];
}

/**
 * Group flat, newest-first rows by actor + second so one multi-field save reads as one
 * moment. Within a group field rows follow the form order, Comment rows come after, and the
 * item's own created / deleted rows come last so "Created" is always the bottom-most line.
 */
export function groupHistory(entries: HistoryEntry[], entityType: HistoryEntityType): HistoryGroup[] {
  const order = Object.keys(HISTORY_FIELDS[entityType]);
  const rank = (e: HistoryEntry) => {
    if (e.kind === "comment") return order.length + 1;
    if (!e.field) return order.length + 2; // created / deleted rows last
    const i = order.indexOf(e.field);
    return i === -1 ? order.length : i;
  };
  const groups: HistoryGroup[] = [];
  for (const e of entries) {
    const key = `${e.actorId ?? ""}|${e.via ?? ""}|${e.occurredAt.slice(0, 19)}`;
    const last = groups.at(-1);
    if (last && last.key === key) last.entries.push(e);
    else groups.push({ key, actorName: e.actorName, via: e.via, occurredAt: e.occurredAt, entries: [e] });
  }
  for (const g of groups) g.entries.sort((a, b) => rank(a) - rank(b));
  return groups;
}

export function EntityHistory({
  entries,
  entityType,
  loading,
  error,
}: {
  entries: HistoryEntry[] | null;
  entityType: HistoryEntityType;
  loading?: boolean;
  error?: string | null;
}) {
  if (error) {
    return (
      <p role="alert" className="text-caption text-tag-red">
        {error}
      </p>
    );
  }
  if (loading && !entries) return <p className="py-6 text-center text-caption text-ink-subtle">Loading history…</p>;
  if (!entries) return null;
  if (entries.length === 0) return <p className="py-6 text-center text-caption text-ink-subtle">No changes yet</p>;

  return (
    <div aria-busy={loading || undefined} className={cn("relative", loading && "opacity-60 transition-opacity")}>
      {loading && (
        <p role="status" className="mb-2 text-caption text-ink-tertiary">
          Refreshing…
        </p>
      )}
      <ol className="flex flex-col gap-4">
        {groupHistory(entries, entityType).map((g) => (
          <li key={g.key} className="flex gap-3 text-caption">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-hairline-tertiary" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">{g.actorName ?? "Someone"}</span>
                <ViaBadge via={g.via} />
                <time dateTime={g.occurredAt} title={fmtDateTime(g.occurredAt)} className="text-ink-tertiary">
                  {relative(g.occurredAt)}
                </time>
              </p>
              <ul className="mt-1 ml-4 flex flex-col gap-1 text-caption text-ink-muted">
                {g.entries.map((e) => (
                  <li key={e.id}>
                    <HistoryLine entry={e} />
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HistoryLine({ entry: e }: { entry: HistoryEntry }) {
  if (e.kind === "comment") {
    return e.action === "deleted" ? (
      <>
        Deleted a comment: <span className="text-ink-subtle line-through">{e.oldLabel}</span>
      </>
    ) : (
      <>
        Commented: <span className="whitespace-pre-line text-ink">{e.newLabel}</span>
      </>
    );
  }
  if (e.action === "created") return <>Created</>;
  if (e.action === "deleted") return <>Deleted</>;
  if (e.kind === "evidence") {
    const linked = e.newLabel && e.newLabel !== "empty";
    return linked ? <>Linked evidence “{e.newLabel}”</> : <>Unlinked evidence “{e.oldLabel}”</>;
  }
  return (
    <>
      <span className="text-ink">{e.fieldLabel}</span>: <span className="text-ink-subtle">{e.oldLabel}</span>{" "}
      <ArrowRight aria-label="to" className="inline size-3 text-ink-tertiary" />{" "}
      <span className="text-ink">{e.newLabel}</span>
    </>
  );
}

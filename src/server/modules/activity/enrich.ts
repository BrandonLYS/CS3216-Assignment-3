import {
  historyField,
  labelFor,
  type ActivityAction,
  type EntityType,
  type HistoryEntityType,
  type HistoryFieldKind,
} from "@/shared/domain";
import { fmtDate } from "@/shared/lib/dates";
import type { ActivityItem } from "./service";

/** One flat, display-ready history row. Grouping happens client-side. */
export interface HistoryEntry {
  id: string;
  action: ActivityAction;
  /** task | risk | milestone for the item's own events; comment for Comment events. */
  entityType: EntityType;
  field: string | null;
  fieldLabel: string | null;
  kind: HistoryFieldKind | "comment" | null;
  /** Raw values, kept for the AI layer. */
  oldValue: unknown;
  newValue: unknown;
  /** Display strings; a Comment body lives here. */
  oldLabel: string | null;
  newLabel: string | null;
  actorId: string | null;
  actorName: string | null;
  /** ISO timestamp. */
  occurredAt: string;
}

export interface RefLookup {
  statuses: Map<string, string>;
  people: Map<string, string>;
  teams: Map<string, string>;
  milestones: Map<string, string>;
  labels: Map<string, string>;
}

const EMPTY = "empty";
const TEXT_MAX = 80;

const refName = (m: Map<string, string>, v: unknown) =>
  v == null || v === "" ? EMPTY : (m.get(String(v)) ?? `${String(v)} (deleted)`);

export function describeValue(kind: HistoryFieldKind, v: unknown, refs: RefLookup): string {
  if (v === null || v === undefined || v === "") return EMPTY;
  switch (kind) {
    case "status":
      return refName(refs.statuses, v);
    case "person":
      return refName(refs.people, v);
    case "team":
      return refName(refs.teams, v);
    case "milestone":
      return refName(refs.milestones, v);
    case "labels":
      return Array.isArray(v) && v.length ? v.map((id) => refName(refs.labels, id)).join(", ") : EMPTY;
    case "date":
      return fmtDate(String(v), "d MMM yyyy");
    case "enum":
      return labelFor(String(v));
    case "number":
    case "evidence":
      return String(v);
    default: {
      const s = String(v).split("\n")[0] ?? "";
      return s.length > TEXT_MAX ? `${s.slice(0, TEXT_MAX)}…` : s;
    }
  }
}

const bodyOf = (v: unknown): string | null =>
  v && typeof v === "object" && "body" in v ? String((v as { body: unknown }).body) : null;

/** Pure: turn raw Activity Events into display rows for one item's History. */
export function enrichHistory(rows: ActivityItem[], entityType: HistoryEntityType, refs: RefLookup): HistoryEntry[] {
  return rows.map(({ event: e, actorName }) => {
    const base = {
      id: e.id,
      action: e.action,
      entityType: e.entityType,
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      actorId: e.actorId,
      actorName,
      occurredAt: e.occurredAt.toISOString(),
    };
    if (e.entityType === "comment") {
      return {
        ...base,
        fieldLabel: "Comment",
        kind: "comment" as const,
        oldLabel: bodyOf(e.oldValue),
        newLabel: bodyOf(e.newValue) ?? (e.action === "created" ? e.entityLabel : null),
      };
    }
    if (e.action !== "updated" || !e.field) {
      return { ...base, fieldLabel: null, kind: null, oldLabel: null, newLabel: null };
    }
    const def = historyField(entityType, e.field);
    return {
      ...base,
      fieldLabel: def.label,
      kind: def.kind,
      oldLabel: describeValue(def.kind, e.oldValue, refs),
      newLabel: describeValue(def.kind, e.newValue, refs),
    };
  });
}

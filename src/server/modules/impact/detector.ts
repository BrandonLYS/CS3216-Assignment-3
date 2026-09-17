import { TERMINAL_CATEGORIES, type StatusCategory } from "@/shared/domain";
import { fmtDate } from "@/shared/lib/dates";
import type { FieldChange } from "@/server/core/diff";

/**
 * Pure, deterministic contradiction rules (issue #38, ADR 0008). No I/O: the subscriber loads
 * the rows and passes them in. Each rule returns the human reason when the Assumption is
 * contradicted, or `null` when it still holds.
 */

export interface DateAssumptionLike {
  targetField: string | null;
  assumedUntil: string | null;
}

/** A date Assumption breaks only when the watched field moves past the assumed date. */
export function dateContradiction(a: DateAssumptionLike, change: FieldChange, itemLabel: string): string | null {
  if (!a.targetField || !a.assumedUntil || change.field !== a.targetField) return null;
  const next = typeof change.newValue === "string" ? change.newValue : null;
  if (!next || next <= a.assumedUntil) return null;
  const from = typeof change.oldValue === "string" ? fmtDate(change.oldValue, "d MMM yyyy") : "unset";
  const field = a.targetField === "startDate" ? "start date" : "due date";
  return `"${itemLabel}" ${field} moved from ${from} to ${fmtDate(next, "d MMM yyyy")}, past the assumed ${fmtDate(a.assumedUntil, "d MMM yyyy")}`;
}

export const personContradiction = (personLabel: string) => `${personLabel} was removed from the project`;

export interface DependencyEnd {
  label: string;
  category: StatusCategory;
  statusName: string;
  /** Milestones: due date. Tasks: due date as predecessor, start (or due) date as successor anchor. */
  dueDate: string | null;
  startDate: string | null;
}

/**
 * A Dependency is blocking when its predecessor is open and either is itself blocked or is
 * due after the successor's anchor (start, else due) - the same rule as `dependency_late`.
 */
export function dependencyContradiction(predecessor: DependencyEnd, successor: DependencyEnd): string | null {
  if (TERMINAL_CATEGORIES.has(predecessor.category)) return null;
  const pair = `"${predecessor.label}" -> "${successor.label}" became blocking`;
  if (predecessor.category === "blocked") return `${pair}: ${predecessor.label} is blocked (${predecessor.statusName})`;
  const anchor = successor.startDate ?? successor.dueDate;
  if (!predecessor.dueDate || !anchor || predecessor.dueDate <= anchor) return null;
  const which = successor.startDate ? "start" : "due";
  return `${pair}: ${predecessor.label} due ${fmtDate(predecessor.dueDate, "d MMM yyyy")} is after ${successor.label} ${which} ${fmtDate(anchor, "d MMM yyyy")}`;
}

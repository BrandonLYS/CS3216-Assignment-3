import { labelFor, type EntityType } from "./index";

/**
 * Items that own a History tab: the commentable items plus the decision-memory nodes.
 * Spelled out (and checked with `satisfies`) rather than aliased because this module is
 * re-exported from ./index and a runtime alias would hit the cycle's TDZ on load.
 */
export const HISTORY_ENTITY_TYPES = [
  "task",
  "risk",
  "milestone",
  "decision",
  "assumption",
] as const satisfies readonly EntityType[];
export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];

export type HistoryFieldKind =
  | "text"
  | "date"
  | "enum"
  | "number"
  // Reference kinds — enriched id → current name on the server.
  | "status"
  | "person"
  | "team"
  | "milestone"
  | "labels"
  // #6: rec.updated field "evidence", value = Evidence title.
  | "evidence"
  // Synthetic list-valued fields (Decision `assumptions` / `sources`): array of display strings.
  | "list";

export interface HistoryFieldDef {
  label: string;
  kind: HistoryFieldKind;
}

/**
 * Per-entity field → display definition. Key order = render order within one save
 * (matches the dialog forms). Labels equal the form labels in the three dialogs.
 */
export const HISTORY_FIELDS: Record<HistoryEntityType, Record<string, HistoryFieldDef>> = {
  task: {
    title: { label: "Title", kind: "text" },
    description: { label: "Description", kind: "text" },
    statusId: { label: "Status", kind: "status" },
    priority: { label: "Priority", kind: "enum" },
    assigneeId: { label: "Owner", kind: "person" },
    teamId: { label: "Team", kind: "team" },
    milestoneId: { label: "Milestone", kind: "milestone" },
    estimateHours: { label: "Estimate (hours)", kind: "number" },
    startDate: { label: "Start date", kind: "date" },
    dueDate: { label: "Due date", kind: "date" },
    labelIds: { label: "Labels", kind: "labels" },
    evidence: { label: "Evidence", kind: "evidence" },
  },
  risk: {
    title: { label: "Title", kind: "text" },
    cause: { label: "Cause", kind: "text" },
    impactDescription: { label: "Impact", kind: "text" },
    probability: { label: "Probability", kind: "enum" },
    impact: { label: "Impact level", kind: "enum" },
    statusId: { label: "Status", kind: "status" },
    ownerId: { label: "Owner", kind: "person" },
    mitigation: { label: "Mitigation", kind: "text" },
    reviewDate: { label: "Review date", kind: "date" },
    description: { label: "Notes", kind: "text" },
    evidence: { label: "Evidence", kind: "evidence" },
  },
  milestone: {
    name: { label: "Name", kind: "text" },
    description: { label: "Description", kind: "text" },
    dueDate: { label: "Due date", kind: "date" },
    statusId: { label: "Status", kind: "status" },
    ownerId: { label: "Owner", kind: "person" },
    evidence: { label: "Evidence", kind: "evidence" },
  },
  decision: {
    title: { label: "Title", kind: "text" },
    decidedOn: { label: "Decided on", kind: "date" },
    ownerId: { label: "Owner", kind: "person" },
    status: { label: "Status", kind: "enum" },
    context: { label: "Context", kind: "text" },
    chosen: { label: "Chosen", kind: "text" },
    alternatives: { label: "Alternatives", kind: "text" },
    revisitWhen: { label: "Revisit when", kind: "text" },
    sources: { label: "Sources", kind: "list" },
    assumptions: { label: "Assumptions", kind: "list" },
    supersedes: { label: "Supersedes", kind: "text" },
  },
  assumption: {
    statement: { label: "Statement", kind: "text" },
    state: { label: "State", kind: "enum" },
    assumedUntil: { label: "Assumed until", kind: "date" },
  },
};

/** Definition for a field; unknown fields fall back to a humanised key rendered as text. */
export const historyField = (entityType: HistoryEntityType, field: string): HistoryFieldDef =>
  HISTORY_FIELDS[entityType][field] ?? { label: labelFor(field), kind: "text" };

/**
 * Fixed domain vocabulary. Anything here is system-defined and stable;
 * user-customisable vocabulary (Statuses, Labels) lives in the database
 * and maps onto these values. See CONTEXT.md and docs/adr/0003.
 */

export const TASK_STATUS_CATEGORIES = ["not_started", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatusCategory = (typeof TASK_STATUS_CATEGORIES)[number];

export const MILESTONE_STATUS_CATEGORIES = ["planned", "at_risk", "reached", "missed"] as const;
export type MilestoneStatusCategory = (typeof MILESTONE_STATUS_CATEGORIES)[number];

export const RISK_STATUS_CATEGORIES = ["open", "monitoring", "mitigated", "closed"] as const;
export type RiskStatusCategory = (typeof RISK_STATUS_CATEGORIES)[number];

export const STATUS_CATEGORIES = [
  ...TASK_STATUS_CATEGORIES,
  ...MILESTONE_STATUS_CATEGORIES,
  ...RISK_STATUS_CATEGORIES,
] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

/** Which kind of item a Status applies to. */
export const STATUS_SCOPES = ["task", "milestone", "risk"] as const;
export type StatusScope = (typeof STATUS_SCOPES)[number];

export const CATEGORIES_BY_SCOPE: Record<StatusScope, readonly StatusCategory[]> = {
  task: TASK_STATUS_CATEGORIES,
  milestone: MILESTONE_STATUS_CATEGORIES,
  risk: RISK_STATUS_CATEGORIES,
};

/** Categories that mean "this item is finished, nothing more will happen". */
export const TERMINAL_CATEGORIES: ReadonlySet<StatusCategory> = new Set([
  "done",
  "cancelled",
  "reached",
  "missed",
  "mitigated",
  "closed",
]);

export const PROJECT_STATUSES = ["active", "on_hold", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const HEALTH_LEVELS = ["green", "amber", "red"] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];

export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SCALE_LEVELS = ["low", "medium", "high"] as const;
export type ScaleLevel = (typeof SCALE_LEVELS)[number];

/** Risk severity is probability x impact on a 1..3 scale, so 1..9. */
export const RISK_SEVERITY_SCORE: Record<ScaleLevel, number> = { low: 1, medium: 2, high: 3 };
export const riskSeverity = (r: { probability: ScaleLevel; impact: ScaleLevel }) =>
  RISK_SEVERITY_SCORE[r.probability] * RISK_SEVERITY_SCORE[r.impact];

/** Endpoints a Dependency may connect. */
export const DEPENDENCY_ITEM_TYPES = ["task", "milestone"] as const;
export type DependencyItemType = (typeof DEPENDENCY_ITEM_TYPES)[number];

/** Only finish-to-start today; column exists so other types are additive. */
export const DEPENDENCY_TYPES = ["finish_to_start"] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const EVIDENCE_KINDS = ["plan", "minutes", "status_update", "task_export", "risk_register", "other"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Entity types that appear in Activity Events and Dependencies. */
export const ENTITY_TYPES = [
  "project",
  "task",
  "milestone",
  "dependency",
  "risk",
  "evidence",
  "person",
  "team",
  "label",
  "status",
  "comment",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Entity types a Comment (and, later, an Evidence link) may attach to. */
export const COMMENTABLE_ENTITY_TYPES = ["task", "risk", "milestone"] as const satisfies readonly EntityType[];
export type CommentableEntityType = (typeof COMMENTABLE_ENTITY_TYPES)[number];
export const COMMENT_MAX_LENGTH = 4000;

export const ACTIVITY_ACTIONS = ["created", "updated", "deleted"] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const labelFor = (value: string) => value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

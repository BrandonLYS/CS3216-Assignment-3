import type { StatusCategory, StatusScope } from "@/shared/domain";

export interface DefaultStatus {
  scope: StatusScope;
  category: StatusCategory;
  name: string;
  color: string;
  isDefault?: boolean;
}

export const TAG = {
  red: "#eb5757",
  orange: "#f2994a",
  yellow: "#f2c94c",
  green: "#4cb782",
  blue: "#4ea7fc",
  purple: "#a68af7",
  gray: "#8a8f98",
} as const;

/** Seeded into every new project (ADR 0003). */
export const DEFAULT_STATUSES: DefaultStatus[] = [
  { scope: "task", category: "not_started", name: "Backlog", color: TAG.gray },
  { scope: "task", category: "not_started", name: "Todo", color: TAG.blue, isDefault: true },
  { scope: "task", category: "in_progress", name: "In Progress", color: TAG.yellow },
  { scope: "task", category: "blocked", name: "Blocked", color: TAG.red },
  { scope: "task", category: "done", name: "Done", color: TAG.green },
  { scope: "task", category: "cancelled", name: "Cancelled", color: TAG.gray },

  { scope: "milestone", category: "planned", name: "Planned", color: TAG.blue, isDefault: true },
  { scope: "milestone", category: "at_risk", name: "At Risk", color: TAG.orange },
  { scope: "milestone", category: "reached", name: "Reached", color: TAG.green },
  { scope: "milestone", category: "missed", name: "Missed", color: TAG.red },

  { scope: "risk", category: "open", name: "Open", color: TAG.orange, isDefault: true },
  { scope: "risk", category: "monitoring", name: "Monitoring", color: TAG.yellow },
  { scope: "risk", category: "mitigated", name: "Mitigated", color: TAG.green },
  { scope: "risk", category: "closed", name: "Closed", color: TAG.gray },
];

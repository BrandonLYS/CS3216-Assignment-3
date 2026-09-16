import { addDays, differenceInCalendarDays, formatISO, parseISO } from "date-fns";
import {
  ATTENTION_DUE_SOON_DAYS,
  ATTENTION_RULES,
  RISK_TOP_SEVERITY,
  TERMINAL_CATEGORIES,
  labelFor,
  riskSeverity,
  type AttentionRule,
  type DependencyItemType,
  type ScaleLevel,
  type StatusCategory,
} from "@/shared/domain";
import { fmtDate } from "@/shared/lib/dates";

/**
 * Pure, deterministic Attention evaluator (issue #7). No I/O: the caller fetches one
 * Project's rows and passes them in. Output is serialisable and free of UI concerns so
 * the future Health Briefing can enrich it rather than recompute it.
 */

export interface AttentionItem {
  /** Most severe matched rule (the group it lives in). */
  rule: AttentionRule;
  /** Every matched rule, severity order (`matched[0] === rule`). */
  matched: AttentionRule[];
  /** One human sentence per matched rule, same order as `matched`. */
  reasons: string[];
  entityType: "task" | "milestone" | "risk";
  entityId: string;
  /** Task title / Milestone name / Risk title. */
  label: string;
  /** "KEY-12" for Tasks, "R-3" for Risks. */
  code?: string;
  /** Deep link that opens the item's dialog. */
  href: string;
  /** yyyy-MM-dd the winning rule keyed on (due date / milestone date / dependency anchor). */
  date?: string;
  /** Ascending = more urgent; used for cross-Project re-sort. */
  urgency: number;
  projectId: string;
}

export interface AttentionGroup {
  rule: AttentionRule;
  items: AttentionItem[];
}

export interface AttentionResult {
  /** One group per matched rule in `ATTENTION_RULES` order; empty groups omitted. */
  groups: AttentionGroup[];
  /** Every rule is a key (0 when absent) so tiles can index it directly. */
  counts: Record<AttentionRule, number>;
}

export interface AttentionInput {
  /** yyyy-MM-dd, computed once per request by the caller. */
  today: string;
  project: { id: string; key: string };
  tasks: Array<{
    task: {
      id: string;
      number: number;
      title: string;
      startDate: string | null;
      dueDate: string | null;
      milestoneId: string | null;
    };
    status: { name: string; category: StatusCategory };
  }>;
  milestones: Array<{
    milestone: { id: string; name: string; dueDate: string };
    status: { category: StatusCategory };
  }>;
  risks: Array<{
    risk: { id: string; number: number; title: string; probability: ScaleLevel; impact: ScaleLevel };
    status: { category: StatusCategory };
  }>;
  dependencies: Array<{
    predecessorType: DependencyItemType;
    predecessorId: string;
    successorType: DependencyItemType;
    successorId: string;
  }>;
}

const ruleIndex = (rule: AttentionRule) => ATTENTION_RULES.indexOf(rule);

/** Tie-break: Risks by title (the register sorts by severity then title), everything else by key. */
const tieKey = (i: AttentionItem) => (i.entityType === "risk" ? i.label : (i.code ?? i.label));

export const compareAttention = (a: AttentionItem, b: AttentionItem) =>
  ruleIndex(a.rule) - ruleIndex(b.rule) || a.urgency - b.urgency || tieKey(a).localeCompare(tieKey(b));

/** Calendar days from `b` to `a` (positive when `a` is after `b`). */
const days = (a: string, b: string) => differenceInCalendarDays(parseISO(a), parseISO(b));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface Hit {
  rule: AttentionRule;
  reason: string;
  urgency: number;
  date?: string;
}
type Base = Omit<AttentionItem, "rule" | "matched" | "reasons" | "urgency" | "date">;

export function evaluateAttention(input: AttentionInput): AttentionResult {
  const { today, project } = input;
  const horizon = formatISO(addDays(parseISO(today), ATTENTION_DUE_SOON_DAYS), { representation: "date" });
  const taskHref = (id: string) => `/projects/${project.id}/tasks?task=${id}`;
  const milestoneHref = (id: string) => `/projects/${project.id}/timeline?milestone=${id}`;
  const riskHref = (id: string) => `/projects/${project.id}/risks?risk=${id}`;

  // 1. Open Tasks only — the evaluator filters itself so callers may pass all or only open Tasks.
  const open = input.tasks.filter((t) => !TERMINAL_CATEGORIES.has(t.status.category));
  const openById = new Map(open.map((t) => [t.task.id, t]));
  const openByMilestone = new Map<string, number>();
  for (const t of open) {
    if (t.task.milestoneId) openByMilestone.set(t.task.milestoneId, (openByMilestone.get(t.task.milestoneId) ?? 0) + 1);
  }
  const openMilestones = input.milestones.filter((m) => !TERMINAL_CATEGORIES.has(m.status.category));
  const openMilestoneById = new Map(openMilestones.map((m) => [m.milestone.id, m]));

  // 2. Collect hits per entity key.
  const matches = new Map<string, { base: Base; hits: Hit[] }>();
  const hit = (key: string, base: Base, h: Hit) => {
    const entry = matches.get(key);
    if (entry) entry.hits.push(h);
    else matches.set(key, { base, hits: [h] });
  };

  for (const t of open) {
    const key = `task:${t.task.id}`;
    const base: Base = {
      entityType: "task",
      entityId: t.task.id,
      label: t.task.title,
      code: `${project.key}-${t.task.number}`,
      href: taskHref(t.task.id),
      projectId: project.id,
    };
    const due = t.task.dueDate;
    if (due && due < today) {
      const n = -days(due, today);
      hit(key, base, {
        rule: "task_overdue",
        reason: `Due ${fmtDate(due)}, ${plural(n, "day")} ago`,
        urgency: days(due, today),
        date: due,
      });
    }
    if (due && due >= today && due <= horizon) {
      const n = days(due, today);
      hit(key, base, {
        rule: "task_due_soon",
        reason: n === 0 ? "Due today" : `Due ${fmtDate(due)}, in ${plural(n, "day")}`,
        urgency: n,
        date: due,
      });
    }
    if (t.status.category === "blocked") {
      hit(key, base, {
        rule: "task_blocked",
        reason: `Blocked (${t.status.name})`,
        urgency: due ? days(due, today) : Number.MAX_SAFE_INTEGER,
        date: due ?? undefined,
      });
    }
  }

  for (const m of openMilestones) {
    const k = openByMilestone.get(m.milestone.id) ?? 0;
    const due = m.milestone.dueDate;
    if (due < today && k > 0) {
      hit(
        `milestone:${m.milestone.id}`,
        {
          entityType: "milestone",
          entityId: m.milestone.id,
          label: m.milestone.name,
          href: milestoneHref(m.milestone.id),
          projectId: project.id,
        },
        {
          rule: "milestone_past_open",
          reason: `Milestone date ${fmtDate(due)} passed, ${plural(k, "open task")}`,
          urgency: days(due, today),
          date: due,
        },
      );
    }
  }

  for (const r of input.risks) {
    if (TERMINAL_CATEGORIES.has(r.status.category)) continue;
    const sev = riskSeverity(r.risk);
    if (sev < RISK_TOP_SEVERITY) continue;
    hit(
      `risk:${r.risk.id}`,
      {
        entityType: "risk",
        entityId: r.risk.id,
        label: r.risk.title,
        code: `R-${r.risk.number}`,
        href: riskHref(r.risk.id),
        projectId: project.id,
      },
      {
        rule: "risk_top",
        reason: `Severity ${sev} (${labelFor(r.risk.probability)} / ${labelFor(r.risk.impact)})`,
        urgency: -sev,
      },
    );
  }

  for (const e of input.dependencies) {
    if (e.successorType !== "task") continue;
    const successor = openById.get(e.successorId);
    if (!successor) continue;
    let upstreamDue: string | null;
    let upLabel: string;
    if (e.predecessorType === "task") {
      const up = openById.get(e.predecessorId);
      if (!up) continue; // done/cancelled or missing upstream never raises a flag
      upstreamDue = up.task.dueDate;
      upLabel = `${project.key}-${up.task.number}`;
    } else {
      const up = openMilestoneById.get(e.predecessorId);
      if (!up) continue;
      upstreamDue = up.milestone.dueDate;
      upLabel = up.milestone.name;
    }
    if (!upstreamDue) continue;
    const anchor = successor.task.startDate ?? successor.task.dueDate;
    if (!anchor) continue;
    if (upstreamDue <= anchor) continue;
    const slip = days(upstreamDue, anchor);
    hit(
      `task:${successor.task.id}`,
      {
        entityType: "task",
        entityId: successor.task.id,
        label: successor.task.title,
        code: `${project.key}-${successor.task.number}`,
        href: taskHref(successor.task.id),
        projectId: project.id,
      },
      {
        rule: "dependency_late",
        reason: `Depends on ${upLabel}, due ${fmtDate(upstreamDue)}, after ${
          successor.task.startDate ? "start" : "due"
        } ${fmtDate(anchor)}`,
        urgency: -slip,
        date: anchor,
      },
    );
  }

  // 3. Dedupe: one item per entity, filed under its most severe rule.
  const items: AttentionItem[] = [];
  for (const { base, hits } of matches.values()) {
    const sorted = [...hits].sort((a, b) => ruleIndex(a.rule) - ruleIndex(b.rule) || a.urgency - b.urgency);
    const win = sorted[0]!;
    // Several hits of the same rule (e.g. two late upstreams) collapse to one entry in `matched`.
    const matched: AttentionRule[] = [];
    for (const h of sorted) if (!matched.includes(h.rule)) matched.push(h.rule);
    items.push({
      ...base,
      rule: win.rule,
      matched,
      reasons: sorted.map((h) => h.reason),
      urgency: win.urgency,
      date: win.date,
    });
  }

  // 4. Groups in severity order, items by urgency; counts for every rule.
  const counts = Object.fromEntries(ATTENTION_RULES.map((r) => [r, 0])) as Record<AttentionRule, number>;
  const groups: AttentionGroup[] = [];
  for (const rule of ATTENTION_RULES) {
    const ruleItems = items.filter((i) => i.rule === rule).sort(compareAttention);
    counts[rule] = ruleItems.length;
    if (ruleItems.length) groups.push({ rule, items: ruleItems });
  }
  return { groups, counts };
}

import type { AttentionRule } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";

/** Rule → label and tone. The only place UI learns what a rule id means. */
export const ATTENTION_RULE_META: Record<AttentionRule, { label: string; plural: string; text: string; bg: string }> = {
  task_overdue: { label: "Overdue", plural: "overdue", text: "text-tag-red", bg: "bg-tag-red/10" },
  dependency_late: {
    label: "Late dependency",
    plural: "late dependencies",
    text: "text-tag-orange",
    bg: "bg-tag-orange/10",
  },
  milestone_past_open: {
    label: "Milestone passed",
    plural: "milestones passed",
    text: "text-tag-purple",
    bg: "bg-tag-purple/10",
  },
  task_blocked: { label: "Blocked", plural: "blocked", text: "text-tag-yellow", bg: "bg-tag-yellow/10" },
  risk_top: { label: "Top risk", plural: "top risks", text: "text-tag-orange", bg: "bg-tag-orange/10" },
  task_due_soon: { label: "Due soon", plural: "due soon", text: "text-tag-blue", bg: "bg-tag-blue/10" },
};

/**
 * `count` form ("3 overdue") is the Dashboard chip; label form ("Overdue") is the group
 * header or the secondary tag on an item.
 */
export function AttentionBadge({
  rule,
  count,
  className,
}: {
  rule: AttentionRule;
  count?: number;
  className?: string;
}) {
  const meta = ATTENTION_RULE_META[rule];
  return (
    <Badge className={cn(meta.bg, meta.text, className)}>
      {count !== undefined ? `${count} ${meta.plural}` : meta.label}
    </Badge>
  );
}

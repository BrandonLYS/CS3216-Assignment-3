import { CalendarClock, Link2, ScrollText, User } from "lucide-react";
import type { AssumptionRow } from "@/server/modules/decisions/schema";
import { labelFor, type AssumptionState, type AssumptionSubtype } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";

export const ASSUMPTION_ICON: Record<AssumptionSubtype, typeof User> = {
  date: CalendarClock,
  person: User,
  dependency: Link2,
  external_rule: ScrollText,
};

const STATE_CLASS: Record<AssumptionState, string> = {
  holding: "border-hairline text-ink-muted",
  broken: "border-tag-red/40 bg-tag-red/10 text-tag-red",
  retired: "border-hairline text-ink-tertiary",
};

/** One Assumption as a compact chip: subtype icon, statement, state via colour (and text for broken). */
export function AssumptionChip({
  assumption,
  className,
}: {
  assumption: Pick<AssumptionRow, "statement" | "subtype" | "state">;
  className?: string;
}) {
  const Icon = ASSUMPTION_ICON[assumption.subtype];
  return (
    <span
      title={`${labelFor(assumption.subtype)} assumption, ${assumption.state}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border bg-surface-2 px-2 py-0.5 text-caption",
        STATE_CLASS[assumption.state],
        className,
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span className={cn("truncate", assumption.state === "retired" && "line-through")}>{assumption.statement}</span>
      {assumption.state !== "holding" && <span className="shrink-0">{labelFor(assumption.state)}</span>}
    </span>
  );
}

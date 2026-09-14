import { AlertOctagon, Minus } from "lucide-react";
import type { Priority } from "@/shared/domain";
import { labelFor } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";

const BARS: Record<Exclude<Priority, "none" | "urgent">, number> = { low: 1, medium: 2, high: 3 };

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const title = `Priority: ${labelFor(priority)}`;
  if (priority === "none") return <Minus className={cn("size-3.5 text-ink-tertiary", className)} aria-label={title} />;
  if (priority === "urgent")
    return <AlertOctagon className={cn("size-3.5 text-tag-orange", className)} aria-label={title} />;
  const n = BARS[priority];
  return (
    <span className={cn("inline-flex h-3.5 items-end gap-[2px]", className)} title={title} aria-label={title}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-[1px]", i <= n ? "bg-ink-muted" : "bg-hairline-tertiary")}
          style={{ height: `${4 + i * 3}px` }}
        />
      ))}
    </span>
  );
}

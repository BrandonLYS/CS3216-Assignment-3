import type { StatusRow } from "@/server/modules/statuses/schema";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";

type StatusLike = Pick<StatusRow, "name" | "color" | "category">;

export function StatusBadge({ status, className }: { status: StatusLike; className?: string }) {
  return (
    <Badge color={status.color} className={className}>
      {status.name}
    </Badge>
  );
}

/** Compact status glyph (circle with fill reflecting category) — used in dense lists. */
export function StatusGlyph({ status, className }: { status: StatusLike; className?: string }) {
  const c = status.category;
  const filled = c === "done" || c === "reached" || c === "mitigated" || c === "closed";
  const half = c === "in_progress" || c === "monitoring" || c === "at_risk";
  const cancelled = c === "cancelled" || c === "missed";
  return (
    <span
      className={cn(
        "relative inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px]",
        className,
      )}
      style={{ borderColor: status.color, opacity: cancelled ? 0.5 : 1 }}
      title={status.name}
    >
      {filled && <span className="size-2 rounded-full" style={{ background: status.color }} />}
      {half && (
        <span
          className="absolute inset-[2px] rounded-full"
          style={{ background: `conic-gradient(${status.color} 0 50%, transparent 50% 100%)` }}
        />
      )}
      {c === "blocked" && <span className="size-1.5 rounded-[1px]" style={{ background: status.color }} />}
      {cancelled && <span className="h-[1.5px] w-2 rotate-45 rounded" style={{ background: status.color }} />}
    </span>
  );
}

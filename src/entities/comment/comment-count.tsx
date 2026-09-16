import { MessageSquare } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/** Small "N comments" chip for Task rows and board cards; renders nothing when there are none. */
export function CommentCount({ n, className }: { n: number; className?: string }) {
  if (n === 0) return null;
  const label = `${n} comment${n === 1 ? "" : "s"}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex items-center gap-1 text-caption text-ink-tertiary", className)}
    >
      <MessageSquare className="size-3" />
      {n}
    </span>
  );
}

import type { HealthLevel, ProjectStatus } from "@/shared/domain";
import { labelFor } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";

export const HEALTH_COLOR: Record<HealthLevel, string> = {
  green: "var(--color-tag-green)",
  amber: "var(--color-tag-orange)",
  red: "var(--color-tag-red)",
};

export function HealthDot({ health, className }: { health: HealthLevel; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: HEALTH_COLOR[health] }}
      title={`Health: ${labelFor(health)}`}
    />
  );
}

export function HealthBadge({ health }: { health: HealthLevel }) {
  return <Badge color={HEALTH_COLOR[health]}>{labelFor(health)}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge className={status === "archived" ? "opacity-60" : undefined}>{labelFor(status)}</Badge>;
}

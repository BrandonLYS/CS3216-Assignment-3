import { labelFor, type DecisionStatus } from "@/shared/domain";
import { Badge } from "@/shared/ui/badge";

const COLOR: Record<DecisionStatus, string> = {
  active: "var(--color-tag-green)",
  revisited: "var(--color-tag-yellow)",
  superseded: "var(--color-tag-gray)",
};

export function DecisionStatusBadge({ status, className }: { status: DecisionStatus; className?: string }) {
  return (
    <Badge color={COLOR[status]} className={className}>
      {labelFor(status)}
    </Badge>
  );
}

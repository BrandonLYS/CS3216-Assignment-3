import type { Via } from "@/shared/domain";
import { Badge } from "@/shared/ui";

const LABEL: Record<Via, string> = { assistant: "via Assistant", reflection: "via Reflection", system: "System" };

/** Marks an Activity Event made on the User's behalf (ADR 0007). Renders nothing for direct actions. */
export function ViaBadge({ via }: { via: Via | null }) {
  return via ? <Badge className="text-ink-subtle">{LABEL[via]}</Badge> : null;
}

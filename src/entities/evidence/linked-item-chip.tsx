import { AlertTriangle, Diamond, ListTodo, X } from "lucide-react";
import Link from "next/link";
import type { LinkableEntityType } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";

/** Where an item chip points: the page that owns the item, with its dialog opened by query param. */
export function itemHref(projectId: string, entityType: LinkableEntityType, entityId: string) {
  const base = `/projects/${projectId}`;
  switch (entityType) {
    case "task":
      return `${base}/tasks?task=${entityId}`;
    case "risk":
      return `${base}/risks?risk=${entityId}`;
    case "milestone":
      return `${base}/timeline?milestone=${entityId}`;
  }
}

/** `ACME-12` for Tasks, `R-3` for Risks, nothing for Milestones. */
export const keyTextFor = (projectKey: string, entityType: LinkableEntityType, number: number | null) =>
  entityType === "task" ? `${projectKey}-${number}` : entityType === "risk" ? `R-${number}` : "";

export const LINKED_ITEM_ICON: Record<LinkableEntityType, React.ComponentType<{ className?: string }>> = {
  task: ListTodo,
  risk: AlertTriangle,
  milestone: Diamond,
};

/**
 * One linked Task/Risk/Milestone: type icon, mono key (`ACME-12`, `R-3`, none for milestones),
 * label and an optional unlink control. Key and label are both inside the anchor so its
 * accessible name reads "ACME-12 Implement v2 endpoints". Without `href` the chip is a plain,
 * non-interactive span, safe to nest inside a clickable row (`<a>` in `<button>` is invalid HTML).
 */
export function LinkedItemChip({
  entityType,
  label,
  keyText,
  href,
  onRemove,
  disabled,
  className,
}: {
  entityType: LinkableEntityType;
  label: string;
  keyText?: string;
  href?: string;
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const Icon = LINKED_ITEM_ICON[entityType];
  const name = [keyText, label].filter(Boolean).join(" ");
  const bodyClass = "inline-flex min-w-0 items-center gap-1.5 text-ink";
  const body = (
    <>
      {/* The literal space keeps the accessible name "KEY label" whatever the flex layout does. */}
      {keyText && <span className="shrink-0 font-mono text-[10px] text-ink-subtle">{keyText}</span>}
      {keyText && " "}
      <span className="truncate">{label}</span>
    </>
  );
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-surface-2 py-0.5 pr-1 pl-2 text-caption",
        className,
      )}
    >
      <Icon className="size-3 shrink-0 text-ink-subtle" />
      {href ? (
        <Link href={href} className={cn(bodyClass, "hover:underline")}>
          {body}
        </Link>
      ) : (
        <span className={bodyClass}>{body}</span>
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Unlink ${name}`}
          className="rounded-full p-0.5 text-ink-tertiary hover:text-tag-red disabled:opacity-50"
        >
          <X className="size-3" />
        </button>
      ) : (
        <span className="w-1" />
      )}
    </span>
  );
}

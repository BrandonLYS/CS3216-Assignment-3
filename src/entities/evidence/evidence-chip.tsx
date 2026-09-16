import { Link2, X } from "lucide-react";
import Link from "next/link";
import { labelFor, type EvidenceKind } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";

/** Dot/badge colour per Evidence kind (design tokens only). */
export const EVIDENCE_KIND_COLOR: Record<string, string> = {
  plan: "var(--color-tag-blue)",
  minutes: "var(--color-tag-purple)",
  status_update: "var(--color-tag-green)",
  task_export: "var(--color-tag-yellow)",
  risk_register: "var(--color-tag-orange)",
  other: "var(--color-tag-gray)",
};

/** Where a linked Evidence chip points: the Evidence page with the record selected and anchored. */
export const evidenceHref = (projectId: string, evidenceId: string) =>
  `/projects/${projectId}/evidence?item=${evidenceId}#evidence-${evidenceId}`;

/** One linked Evidence record: kind dot, title (link), kind label and an optional unlink control. */
export function EvidenceChip({
  title,
  kind,
  href,
  onRemove,
  disabled,
}: {
  title: string;
  kind: EvidenceKind | string;
  href: string;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-surface-2 py-0.5 pr-1 pl-2 text-caption">
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: EVIDENCE_KIND_COLOR[kind] }} />
      <Link href={href} className="truncate text-ink hover:underline">
        {title}
      </Link>
      <span className="shrink-0 text-ink-tertiary">{labelFor(kind)}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Unlink ${title}`}
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

/** Small "N linked evidence" glyph for Task rows, board cards and Evidence rows; nothing when 0. */
export function LinkedEvidenceCount({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  const label = `${count} linked evidence`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex items-center gap-1 text-caption text-ink-tertiary", className)}
    >
      <Link2 className="size-3" />
      {count}
    </span>
  );
}

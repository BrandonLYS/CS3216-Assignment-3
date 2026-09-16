import Link from "next/link";
import type { AttentionItem, AttentionResult } from "@/server/modules/workspace/queries";
import { ATTENTION_RULES, type AttentionRule } from "@/shared/domain";
import { Panel } from "@/shared/ui";
import { AttentionBadge } from "@/entities/attention/attention-badge";

const DEFAULT_EMPTY = "Nothing needs attention. Quiet is good news.";

interface CommonProps {
  /** Resolve a Project key for cross-Project lists (Dashboard). */
  showProject?: (projectId: string) => string | undefined;
  emptyText?: string;
}
type Props = CommonProps & ({ result: AttentionResult; flat?: false } | { flat: true; items: AttentionItem[] });

/**
 * Attention items either grouped by rule (Project Overview) or as one flat list (Dashboard).
 * Server component: grouping collapses with native `<details>` so the count in the
 * `<summary>` stays visible without client JS.
 */
export function AttentionList(props: Props) {
  const { showProject, emptyText } = props;
  const empty = (
    <Panel>
      <p className="px-4 py-6 text-center text-caption text-ink-subtle">{emptyText ?? DEFAULT_EMPTY}</p>
    </Panel>
  );

  if (props.flat) {
    if (props.items.length === 0) return empty;
    return (
      <Panel>
        <ul className="divide-y divide-hairline">
          {props.items.map((item) => (
            <AttentionRow key={`${item.entityType}:${item.entityId}`} item={item} showProject={showProject} lead />
          ))}
        </ul>
      </Panel>
    );
  }

  if (props.result.groups.length === 0) return empty;
  return (
    <div className="flex flex-col gap-3">
      {props.result.groups.map((group) => (
        <Panel key={group.rule}>
          <details open>
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 hover:bg-surface-2">
              <AttentionBadge rule={group.rule} />
              <span className="text-caption text-ink-tertiary">{group.items.length}</span>
            </summary>
            <ul className="divide-y divide-hairline border-t border-hairline">
              {group.items.map((item) => (
                <AttentionRow key={`${item.entityType}:${item.entityId}`} item={item} showProject={showProject} />
              ))}
            </ul>
          </details>
        </Panel>
      ))}
    </div>
  );
}

function AttentionRow({
  item,
  showProject,
  lead = false,
}: {
  item: AttentionItem;
  showProject?: (projectId: string) => string | undefined;
  /** Flat lists have no group header, so each row leads with its own rule badge. */
  lead?: boolean;
}) {
  const projectKey = showProject?.(item.projectId);
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
        data-testid="attention-item"
        title={item.reasons.join(" · ")}
      >
        {lead && <AttentionBadge rule={item.rule} />}
        {projectKey && <span className="text-caption text-ink-subtle">{projectKey}</span>}
        {item.code && <span className="font-mono text-caption text-ink-tertiary">{item.code}</span>}
        <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{item.label}</span>
        {item.matched.slice(1).map((r) => (
          <AttentionBadge key={r} rule={r} />
        ))}
        <span className="text-caption text-ink-subtle">{item.reasons[0]}</span>
      </Link>
    </li>
  );
}

/** Inline row of non-zero count chips in severity order; "Clear" when all are zero. */
export function AttentionCountStrip({ counts }: { counts: Record<AttentionRule, number> }) {
  const active = ATTENTION_RULES.filter((rule) => counts[rule] > 0);
  if (active.length === 0) return <span className="text-caption text-ink-tertiary">Clear</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {active.map((rule) => (
        <AttentionBadge key={rule} rule={rule} count={counts[rule]} />
      ))}
    </span>
  );
}

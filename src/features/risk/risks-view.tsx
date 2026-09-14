"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import { patchRiskAction } from "@/server/modules/risks/actions";
import type { RiskListItem } from "@/server/modules/risks/repository";
import { SCALE_LEVELS, TERMINAL_CATEGORIES, labelFor, riskSeverity, type ScaleLevel } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";
import { dueLabel } from "@/shared/lib/dates";
import { Button, EmptyState } from "@/shared/ui";
import { InlineSelect } from "@/shared/ui/inline-select";
import { Avatar } from "@/entities/person/avatar";
import { StatusBadge } from "@/entities/status/status-badge";
import { RiskDialog } from "./risk-dialog";

export function RisksView({ refs, risks }: { refs: ProjectRefs; risks: RiskListItem[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const base = `/projects/${refs.project.id}/risks`;
  const openRisk = risks.find((r) => r.risk.id === params.get("risk"))?.risk ?? null;
  const [creating, setCreating] = React.useState(false);
  const [showClosed, setShowClosed] = React.useState(false);
  const close = () => {
    setCreating(false);
    if (openRisk) router.replace(base, { scroll: false });
  };
  const statuses = refs.statuses.filter((s) => s.scope === "risk");

  const visible = risks
    .filter((r) => showClosed || !TERMINAL_CATEGORIES.has(r.status.category))
    .sort((a, b) => riskSeverity(b.risk) - riskSeverity(a.risk));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-hairline px-6 py-2">
        <p className="text-caption text-ink-subtle">
          {visible.length} risk{visible.length === 1 ? "" : "s"} · sorted by severity
        </p>
        <label className="flex items-center gap-1.5 text-caption text-ink-subtle">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="accent-primary"
          />{" "}
          Show closed
        </label>
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> New risk
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="No risks recorded"
          description="Capture what could go wrong before it does."
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-body-sm">
            <thead className="sticky top-0 z-10 bg-surface-1/95 text-left text-caption text-ink-tertiary backdrop-blur">
              <tr className="[&>th]:border-b [&>th]:border-hairline [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th className="w-16 pl-6!">ID</th>
                <th>Risk</th>
                <th className="w-28">Probability</th>
                <th className="w-28">Impact</th>
                <th className="w-32">Status</th>
                <th className="w-28">Owner</th>
                <th className="w-24">Review</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ risk, status, owner }) => {
                const sev = riskSeverity(risk);
                const review = dueLabel(risk.reviewDate, TERMINAL_CATEGORIES.has(status.category));
                return (
                  <tr
                    key={risk.id}
                    onClick={() => router.replace(`${base}?risk=${risk.id}`, { scroll: false })}
                    className="cursor-pointer border-b border-hairline/60 transition-colors hover:bg-surface-1 [&>td]:px-3 [&>td]:py-2"
                  >
                    <td className="pl-6! font-mono text-caption text-ink-tertiary">R-{risk.number}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={cn(
                            "size-3.5 shrink-0",
                            sev >= 6 ? "text-tag-red" : sev >= 3 ? "text-tag-orange" : "text-ink-tertiary",
                          )}
                        />
                        <span className="truncate text-ink">{risk.title}</span>
                      </div>
                      {risk.mitigation && (
                        <p className="mt-0.5 truncate pl-[22px] text-caption text-ink-tertiary">
                          Mitigation: {risk.mitigation}
                        </p>
                      )}
                    </td>
                    <td>
                      <ScalePicker
                        value={risk.probability}
                        onChange={(probability) => patchRiskAction({ id: risk.id, probability })}
                      />
                    </td>
                    <td>
                      <ScalePicker
                        value={risk.impact}
                        onChange={(impact) => patchRiskAction({ id: risk.id, impact })}
                      />
                    </td>
                    <td>
                      <InlineSelect
                        value={risk.statusId}
                        options={statuses.map((s) => ({ value: s.id, label: <StatusBadge status={s} /> }))}
                        onChange={(statusId) => patchRiskAction({ id: risk.id, statusId })}
                        render={() => <StatusBadge status={status} />}
                      />
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5 text-caption text-ink-muted">
                        <Avatar name={owner?.name} size="xs" /> {owner?.name.split(" ")[0] ?? "—"}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "text-caption",
                        review.tone === "danger"
                          ? "text-tag-red"
                          : review.tone === "warn"
                            ? "text-tag-orange"
                            : "text-ink-tertiary",
                      )}
                    >
                      {review.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RiskDialog open={Boolean(openRisk) || creating} onClose={close} refs={refs} risk={openRisk} />
    </div>
  );
}

const SCALE_COLOR: Record<ScaleLevel, string> = {
  low: "var(--color-tag-gray)",
  medium: "var(--color-tag-orange)",
  high: "var(--color-tag-red)",
};

function ScalePicker({ value, onChange }: { value: ScaleLevel; onChange: (v: ScaleLevel) => Promise<unknown> }) {
  const chip = (v: ScaleLevel) => (
    <span className="inline-flex items-center gap-1.5 text-caption text-ink-muted">
      <span className="size-1.5 rounded-full" style={{ background: SCALE_COLOR[v] }} /> {labelFor(v)}
    </span>
  );
  return (
    <InlineSelect
      value={value}
      options={SCALE_LEVELS.map((v) => ({ value: v, label: chip(v) }))}
      onChange={onChange}
      render={chip}
    />
  );
}

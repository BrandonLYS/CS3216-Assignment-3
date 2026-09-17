import { AlertOctagon, Diamond, FileText, ListTodo, AlertTriangle } from "lucide-react";
import Link from "next/link";
import type { ImpactAlert } from "@/server/modules/impact/service";
import { labelFor } from "@/shared/domain";
import { fmtDate } from "@/shared/lib/dates";
import { Panel } from "@/shared/ui";
import { ASSUMPTION_ICON } from "@/entities/decision/assumption-chip";
import { DismissAlertButton } from "./dismiss-alert-button";

const ITEM_ICON = { task: ListTodo, milestone: Diamond, risk: AlertTriangle } as const;

/**
 * Impact alerts on the Project Overview (issue #38): one panel per broken, undismissed
 * Assumption with the change that broke it, the Decisions that rest on it (and the Sources
 * they cited) and the downstream items from the impact walk. Server component; only the
 * Dismiss button is client-side.
 */
export function ImpactAlerts({ alerts, projectId }: { alerts: ImpactAlert[]; projectId: string }) {
  if (!alerts.length) return null;
  return (
    <section id="impact" className="flex flex-col gap-3" data-testid="impact-alerts">
      {alerts.map((alert) => {
        const Icon = ASSUMPTION_ICON[alert.assumption.subtype];
        return (
          <Panel key={alert.assumption.id} className="border-l-2 border-l-tag-red">
            <div className="flex items-start gap-3 px-4 py-3">
              <AlertOctagon className="mt-0.5 size-4 shrink-0 text-tag-red" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-body-sm text-ink">
                  <span className="font-medium">Broken assumption</span>
                  <span className="inline-flex items-center gap-1 text-caption text-ink-subtle">
                    <Icon className="size-3" /> {labelFor(alert.assumption.subtype)}
                  </span>
                </p>
                <p className="mt-0.5 text-body-sm text-ink-muted">{alert.assumption.statement}</p>
                <p className="mt-1 text-caption text-ink-subtle" data-testid="impact-reason">
                  {alert.reason}
                  {alert.trigger && (
                    <span className="text-ink-tertiary">
                      {" "}
                      · {fmtDate(alert.trigger.occurredAt, "d MMM yyyy, HH:mm")}
                    </span>
                  )}
                </p>
              </div>
              <DismissAlertButton assumptionId={alert.assumption.id} />
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-hairline px-4 py-3 text-body-sm">
              <div>
                <p className="mb-1 text-caption font-medium text-ink-subtle">
                  Affects {alert.decisions.length} decision{alert.decisions.length === 1 ? "" : "s"}
                </p>
                {alert.decisions.length === 0 && (
                  <p className="text-caption text-ink-tertiary">No decision rests on it</p>
                )}
                <ul className="flex flex-col gap-1.5">
                  {alert.decisions.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/projects/${projectId}/decisions?decision=${d.id}`}
                        className="flex items-center gap-2 text-ink hover:underline"
                      >
                        <span className="font-mono text-caption text-ink-tertiary">D-{d.number}</span>
                        <span className="truncate">{d.title}</span>
                        {d.status !== "active" && (
                          <span className="text-caption text-ink-tertiary">{labelFor(d.status)}</span>
                        )}
                      </Link>
                      {d.sources.length > 0 && (
                        <ul className="mt-0.5 flex flex-wrap gap-1 pl-1">
                          {d.sources.map((s) => (
                            <li
                              key={s.id}
                              className="inline-flex max-w-full items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-caption text-ink-subtle"
                              title={s.excerpt}
                            >
                              <FileText className="size-3 shrink-0" />
                              <span className="truncate">{s.label}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-caption font-medium text-ink-subtle">Downstream</p>
                {alert.items.length === 0 && <p className="text-caption text-ink-tertiary">Nothing downstream</p>}
                <ul className="flex flex-col gap-1">
                  {alert.items.map((i) => {
                    const ItemIcon = ITEM_ICON[i.type];
                    return (
                      <li key={`${i.type}:${i.id}`}>
                        <Link href={i.href} className="flex items-center gap-2 text-ink hover:underline">
                          <ItemIcon className="size-3.5 shrink-0 text-ink-tertiary" />
                          {i.code && <span className="font-mono text-caption text-ink-tertiary">{i.code}</span>}
                          <span className="truncate">{i.label}</span>
                          {i.depth > 0 && (
                            <span className="text-caption text-ink-tertiary">
                              {i.depth} hop{i.depth === 1 ? "" : "s"} away
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </Panel>
        );
      })}
    </section>
  );
}

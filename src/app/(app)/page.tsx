import { AlertTriangle, ArrowRight, Diamond, Inbox } from "lucide-react";
import Link from "next/link";
import { ctxForCurrentUser } from "@/server/core/action";
import { workspaceOverview } from "@/server/modules/workspace/queries";
import { labelFor } from "@/shared/domain";
import { dueLabel, fmtDate } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/cn";
import { Badge, EmptyState, PageHeader, Panel, SectionTitle } from "@/shared/ui";
import { ActivityRow } from "@/entities/activity/activity-item";
import { HealthDot } from "@/entities/project/health";
import { StatusGlyph } from "@/entities/status/status-badge";
import { NewProjectButton } from "@/features/project/new-project-button";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await ctxForCurrentUser();
  const o = await workspaceOverview(ctx);
  const attention = [...o.overdueTasks, ...o.blockedTasks.filter((t) => !o.overdueTasks.includes(t))].slice(0, 8);

  if (o.projects.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          icon={<Inbox />}
          title="No projects yet"
          description="Create your first project to start tracking tasks, milestones and risks."
          action={<NewProjectButton />}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${o.stats.activeProjects} active project${o.stats.activeProjects === 1 ? "" : "s"}`}
        actions={<NewProjectButton />}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Overdue tasks" value={o.stats.overdue} tone={o.stats.overdue ? "danger" : "muted"} />
            <Stat label="Due in 14 days" value={o.stats.dueSoon} />
            <Stat label="Blocked" value={o.stats.blocked} tone={o.stats.blocked ? "warn" : "muted"} />
            <Stat label="Open risks" value={o.stats.openRisks} />
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 flex flex-col gap-6">
              <section>
                <SectionTitle className="mb-2">Needs attention</SectionTitle>
                <Panel className="divide-y divide-hairline">
                  {attention.length === 0 && (
                    <p className="px-4 py-6 text-center text-caption text-ink-subtle">
                      Nothing overdue or blocked. Nice.
                    </p>
                  )}
                  {attention.map((t) => {
                    const p = o.projectById(t.projectId)!;
                    const due = dueLabel(t.task.dueDate);
                    return (
                      <Link
                        key={t.task.id}
                        href={`/projects/${p.id}/tasks?task=${t.task.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
                      >
                        <StatusGlyph status={t.status} />
                        <span className="font-mono text-caption text-ink-tertiary">
                          {p.key}-{t.task.number}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{t.task.title}</span>
                        {t.status.category === "blocked" && <Badge color={t.status.color}>Blocked</Badge>}
                        <span
                          className={cn(
                            "text-caption",
                            due.tone === "danger"
                              ? "text-tag-red"
                              : due.tone === "warn"
                                ? "text-tag-orange"
                                : "text-ink-subtle",
                          )}
                        >
                          {due.text}
                        </span>
                      </Link>
                    );
                  })}
                </Panel>
              </section>

              <section>
                <SectionTitle className="mb-2">Upcoming milestones</SectionTitle>
                <Panel className="divide-y divide-hairline">
                  {o.upcomingMilestones.length === 0 && (
                    <p className="px-4 py-6 text-center text-caption text-ink-subtle">
                      No milestones due in the next two weeks.
                    </p>
                  )}
                  {o.upcomingMilestones.map(({ milestone, status }) => {
                    const p = o.projectById(milestone.projectId)!;
                    const due = dueLabel(milestone.dueDate);
                    return (
                      <Link
                        key={milestone.id}
                        href={`/projects/${p.id}/timeline`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
                      >
                        <Diamond className="size-3.5" style={{ color: status.color }} fill={status.color} />
                        <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{milestone.name}</span>
                        <span className="text-caption text-ink-subtle">{p.name}</span>
                        <Badge color={status.color}>{status.name}</Badge>
                        <span
                          className={cn(
                            "w-20 text-right text-caption",
                            due.tone === "danger"
                              ? "text-tag-red"
                              : due.tone === "warn"
                                ? "text-tag-orange"
                                : "text-ink-subtle",
                          )}
                        >
                          {due.text}
                        </span>
                      </Link>
                    );
                  })}
                </Panel>
              </section>

              <section>
                <SectionTitle className="mb-2">Top risks</SectionTitle>
                <Panel className="divide-y divide-hairline">
                  {o.topRisks.length === 0 && (
                    <p className="px-4 py-6 text-center text-caption text-ink-subtle">No open risks.</p>
                  )}
                  {o.topRisks.map(({ risk, status, severity }) => {
                    const p = o.projectById(risk.projectId)!;
                    return (
                      <Link
                        key={risk.id}
                        href={`/projects/${p.id}/risks?risk=${risk.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
                      >
                        <AlertTriangle
                          className={cn(
                            "size-3.5",
                            severity >= 6 ? "text-tag-red" : severity >= 3 ? "text-tag-orange" : "text-ink-subtle",
                          )}
                        />
                        <span className="font-mono text-caption text-ink-tertiary">R-{risk.number}</span>
                        <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{risk.title}</span>
                        <span className="text-caption text-ink-subtle">{p.key}</span>
                        <Badge>
                          {labelFor(risk.probability)} / {labelFor(risk.impact)}
                        </Badge>
                        <Badge color={status.color}>{status.name}</Badge>
                      </Link>
                    );
                  })}
                </Panel>
              </section>
            </div>

            <div className="flex flex-col gap-6">
              <section>
                <SectionTitle className="mb-2">Projects</SectionTitle>
                <Panel className="divide-y divide-hairline">
                  {o.projects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
                    >
                      <HealthDot health={p.health} />
                      <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{p.name}</span>
                      <span className="text-caption text-ink-tertiary">
                        {p.targetDate ? fmtDate(p.targetDate) : labelFor(p.status)}
                      </span>
                      <ArrowRight className="size-3.5 text-ink-tertiary" />
                    </Link>
                  ))}
                </Panel>
              </section>

              <section>
                <SectionTitle className="mb-2">This week&apos;s changes</SectionTitle>
                <Panel className="px-4">
                  {o.activity.length === 0 ? (
                    <p className="py-6 text-center text-caption text-ink-subtle">No changes in the last 7 days.</p>
                  ) : (
                    <ul className="divide-y divide-hairline/60">
                      {o.activity.slice(0, 12).map((a) => (
                        <ActivityRow key={a.event.id} item={a} projectName={o.projectById(a.event.projectId)?.name} />
                      ))}
                    </ul>
                  )}
                </Panel>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: number; tone?: "muted" | "warn" | "danger" }) {
  return (
    <Panel className="px-4 py-3">
      <p className="text-caption text-ink-subtle">{label}</p>
      <p
        className={cn(
          "mt-1 text-headline font-medium tabular-nums",
          tone === "danger" ? "text-tag-red" : tone === "warn" ? "text-tag-orange" : "text-ink",
        )}
      >
        {value}
      </p>
    </Panel>
  );
}

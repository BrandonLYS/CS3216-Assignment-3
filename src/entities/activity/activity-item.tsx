import type { ActivityItem as Item } from "@/server/modules/activity/service";
import { labelFor } from "@/shared/domain";
import { relative } from "@/shared/lib/dates";
import { ViaBadge } from "./via-badge";

const HUMAN_FIELDS: Record<string, string> = {
  statusId: "status",
  assigneeId: "assignee",
  ownerId: "owner",
  milestoneId: "milestone",
  teamId: "team",
  dueDate: "due date",
  startDate: "start date",
  targetDate: "target date",
  estimateHours: "estimate",
  labelIds: "labels",
  impactDescription: "impact",
  reviewDate: "review date",
  sourceDate: "source date",
  evidence: "evidence",
  decidedOn: "decided on",
  revisitWhen: "revisit trigger",
  leadsTo: "consequences",
  assumedUntil: "assumed-until date",
  brokenReason: "broken reason",
  brokenByEventId: "broken-by change",
  alertDismissedAt: "alert",
};

/** Fields whose raw values are ids or timestamps the feed should not print. */
const HIDE_VALUE_FIELDS = new Set([
  "statusId",
  "assigneeId",
  "ownerId",
  "milestoneId",
  "teamId",
  "labelIds",
  "brokenByEventId",
  "alertDismissedAt",
]);

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  return String(v);
}

export function describeActivity({ event }: Item): string {
  const what = `${labelFor(event.entityType)} "${event.entityLabel}"`;
  if (event.action === "created") return `created ${what}`;
  if (event.action === "deleted") return `deleted ${what}`;
  const field = HUMAN_FIELDS[event.field ?? ""] ?? labelFor(event.field ?? "field").toLowerCase();
  if (HIDE_VALUE_FIELDS.has(event.field ?? "")) return `changed ${field} on ${what}`;
  return `changed ${field} on ${what}: ${fmt(event.oldValue)} → ${fmt(event.newValue)}`;
}

export function ActivityRow({ item, projectName }: { item: Item; projectName?: string }) {
  return (
    <li className="flex gap-3 py-2 text-caption">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-hairline-tertiary" />
      <div className="min-w-0 flex-1">
        <p className="text-ink-muted">
          <span className="font-medium text-ink">{item.actorName ?? "Someone"}</span> {describeActivity(item)}{" "}
          <ViaBadge via={item.event.via} />
        </p>
        <p className="text-ink-tertiary">
          {relative(item.event.occurredAt)}
          {projectName && <> · {projectName}</>}
        </p>
      </div>
    </li>
  );
}

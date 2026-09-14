import { ctxForCurrentUser } from "@/server/core/action";
import { workspaceCalendar } from "@/server/modules/workspace/queries";
import { TERMINAL_CATEGORIES } from "@/shared/domain";
import { PageHeader } from "@/shared/ui";
import { Calendar, type CalendarEvent } from "@/widgets/calendar/calendar";

export const metadata = { title: "Calendar" };

export default async function WorkspaceCalendarPage() {
  const ctx = await ctxForCurrentUser();
  const { projects, tasks, milestones } = await workspaceCalendar(ctx);
  const key = new Map(projects.map((p) => [p.id, p.key]));

  const events: CalendarEvent[] = [
    ...tasks
      .filter((t) => t.task.dueDate)
      .map((t) => ({
        id: t.task.id,
        title: t.task.title,
        date: t.task.dueDate!,
        color: t.status.color,
        href: `/projects/${t.projectId}/tasks?task=${t.task.id}`,
        kind: "task" as const,
        meta: `${key.get(t.projectId)}-${t.task.number}`,
        done: TERMINAL_CATEGORIES.has(t.status.category),
      })),
    ...milestones.map(({ milestone, status }) => ({
      id: milestone.id,
      title: milestone.name,
      date: milestone.dueDate,
      color: status.color,
      href: `/projects/${milestone.projectId}/timeline`,
      kind: "milestone" as const,
      meta: key.get(milestone.projectId),
      done: TERMINAL_CATEGORIES.has(status.category),
    })),
  ];

  return (
    <>
      <PageHeader title="Calendar" description="Due dates and milestones across all projects" />
      <div className="min-h-0 flex-1">
        <Calendar events={events} />
      </div>
    </>
  );
}

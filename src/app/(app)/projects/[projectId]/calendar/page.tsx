import { ctxForCurrentUser } from "@/server/core/action";
import { milestonesService } from "@/server/modules/milestones/service";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { tasksService } from "@/server/modules/tasks/service";
import { TERMINAL_CATEGORIES } from "@/shared/domain";
import { Calendar, type CalendarEvent } from "@/widgets/calendar/calendar";

export const metadata = { title: "Calendar" };

export default async function ProjectCalendarPage({ params }: PageProps<"/projects/[projectId]/calendar">) {
  const { projectId } = await params;
  const ctx = await ctxForCurrentUser();
  const [project, tasks, milestones] = await Promise.all([
    assertOwnsProject(ctx.db, ctx.userId, projectId),
    tasksService.list(ctx, projectId),
    milestonesService.list(ctx, projectId),
  ]);
  const base = `/projects/${projectId}`;
  const events: CalendarEvent[] = [
    ...tasks
      .filter((t) => t.task.dueDate)
      .map((t) => ({
        id: t.task.id,
        title: t.task.title,
        date: t.task.dueDate!,
        color: t.status.color,
        href: `${base}/tasks?task=${t.task.id}`,
        kind: "task" as const,
        meta: t.assignee?.name.split(" ")[0],
        done: TERMINAL_CATEGORIES.has(t.status.category),
      })),
    ...milestones.map(({ milestone, status }) => ({
      id: milestone.id,
      title: milestone.name,
      date: milestone.dueDate,
      color: status.color,
      href: `${base}/timeline?milestone=${milestone.id}`,
      kind: "milestone" as const,
      done: TERMINAL_CATEGORIES.has(status.category),
    })),
  ];
  return (
    <div className="min-h-0 flex-1">
      <Calendar events={events} initialDate={project.startDate ?? undefined} />
    </div>
  );
}

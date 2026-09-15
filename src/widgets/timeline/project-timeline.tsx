"use client";

import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import type { DependencyRow } from "@/server/modules/dependencies/schema";
import type { MilestoneWithStatus } from "@/server/modules/milestones/repository";
import type { ProjectRefs } from "@/server/modules/projects/refs";
import type { TaskListItem } from "@/server/modules/tasks/repository";
import { TERMINAL_CATEGORIES } from "@/shared/domain";
import { Button } from "@/shared/ui";
import { MilestoneDialog } from "@/features/milestone/milestone-dialog";
import { TaskDialog } from "@/features/task/task-dialog";
import { Timeline, type TimelineItem } from "./timeline";

export function ProjectTimeline({
  refs,
  tasks,
  milestones,
  dependencies,
}: {
  refs: ProjectRefs;
  tasks: TaskListItem[];
  milestones: MilestoneWithStatus[];
  dependencies: DependencyRow[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const base = `/projects/${refs.project.id}/timeline`;
  const openTask = tasks.find((t) => t.task.id === params.get("task")) ?? null;
  const openMilestone = milestones.find((m) => m.milestone.id === params.get("milestone"))?.milestone ?? null;
  const [newMilestone, setNewMilestone] = React.useState(false);
  const close = () => {
    setNewMilestone(false);
    router.replace(base, { scroll: false });
  };

  const items: TimelineItem[] = [
    ...milestones.map(({ milestone, status }) => ({
      id: milestone.id,
      type: "milestone" as const,
      title: milestone.name,
      start: milestone.dueDate,
      end: milestone.dueDate,
      color: status.color,
      statusName: status.name,
      done: TERMINAL_CATEGORIES.has(status.category),
      href: `${base}?milestone=${milestone.id}`,
      groupId: null,
    })),
    ...tasks.map(({ task, status }) => ({
      id: task.id,
      type: "task" as const,
      title: task.title,
      start: task.startDate ?? task.dueDate,
      end: task.dueDate ?? task.startDate,
      color: status.color,
      statusName: status.name,
      done: TERMINAL_CATEGORIES.has(status.category),
      href: `${base}?task=${task.id}`,
      groupId: task.milestoneId,
      meta: `${refs.project.key}-${task.number}`,
    })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-hairline px-6 py-2">
        <Button size="sm" variant="primary" onClick={() => setNewMilestone(true)}>
          <Plus className="size-3.5" /> New milestone
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Timeline items={items} edges={dependencies} />
      </div>
      <TaskDialog
        open={Boolean(openTask)}
        onClose={close}
        refs={refs}
        task={openTask}
        tasks={tasks}
        dependencies={dependencies}
      />
      <MilestoneDialog
        open={Boolean(openMilestone) || newMilestone}
        onClose={close}
        refs={refs}
        milestone={openMilestone}
        tasks={tasks}
        dependencies={dependencies}
      />
    </div>
  );
}

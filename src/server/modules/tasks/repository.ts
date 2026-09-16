import { and, asc, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { TERMINAL_CATEGORIES } from "@/shared/domain";
import { comments } from "@/server/modules/comments/schema";
import { labels } from "@/server/modules/labels/schema";
import { milestones } from "@/server/modules/milestones/schema";
import { people, teams } from "@/server/modules/people/schema";
import { statuses } from "@/server/modules/statuses/schema";
import { taskLabels, tasks, type NewTaskRow, type TaskRow } from "./schema";

const withJoins = (db: DbOrTx) => {
  // One grouped subquery for Comment counts; no per-row query.
  const commentCounts = db
    .select({ entityId: comments.entityId, n: sql<number>`count(*)::int`.as("n") })
    .from(comments)
    .where(eq(comments.entityType, "task"))
    .groupBy(comments.entityId)
    .as("comment_counts");
  return db
    .select({
      task: tasks,
      status: statuses,
      assignee: people,
      team: teams,
      milestone: { id: milestones.id, name: milestones.name, dueDate: milestones.dueDate },
      commentCount: sql<number>`coalesce(${commentCounts.n}, 0)`.mapWith(Number),
    })
    .from(tasks)
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .leftJoin(people, eq(people.id, tasks.assigneeId))
    .leftJoin(teams, eq(teams.id, tasks.teamId))
    .leftJoin(milestones, eq(milestones.id, tasks.milestoneId))
    .leftJoin(commentCounts, eq(commentCounts.entityId, tasks.id));
};

async function attachLabels<T extends { task: TaskRow }>(db: DbOrTx, rows: T[]) {
  const ids = rows.map((r) => r.task.id);
  if (!ids.length) return rows.map((r) => ({ ...r, labels: [] as (typeof labels.$inferSelect)[] }));
  const links = await db
    .select({ taskId: taskLabels.taskId, label: labels })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.labelId))
    .where(inArray(taskLabels.taskId, ids));
  const byTask = new Map<string, (typeof labels.$inferSelect)[]>();
  for (const l of links) byTask.set(l.taskId, [...(byTask.get(l.taskId) ?? []), l.label]);
  return rows.map((r) => ({ ...r, labels: byTask.get(r.task.id) ?? [] }));
}

export const tasksRepo = {
  listByProject: async (db: DbOrTx, projectId: string) =>
    attachLabels(
      db,
      await withJoins(db)
        .where(eq(tasks.projectId, projectId))
        .orderBy(asc(statuses.sortOrder), asc(tasks.sortOrder), asc(tasks.number)),
    ),

  /** Open (non-terminal) tasks across many projects, dated or not (workspace overview). */
  listOpenByProjects: (db: DbOrTx, projectIds: string[]) =>
    projectIds.length
      ? db
          .select({ task: tasks, status: statuses, projectId: tasks.projectId })
          .from(tasks)
          .innerJoin(statuses, eq(statuses.id, tasks.statusId))
          .where(and(inArray(tasks.projectId, projectIds), notInArray(statuses.category, [...TERMINAL_CATEGORIES])))
      : Promise.resolve([]),

  /** Dated tasks across many projects (workspace calendar). */
  listDatedByProjects: (db: DbOrTx, projectIds: string[]) =>
    projectIds.length
      ? db
          .select({ task: tasks, status: statuses, projectId: tasks.projectId })
          .from(tasks)
          .innerJoin(statuses, eq(statuses.id, tasks.statusId))
          .where(and(inArray(tasks.projectId, projectIds), or(isNotNull(tasks.dueDate), isNotNull(tasks.startDate))))
      : Promise.resolve([]),

  findById: async (db: DbOrTx, id: string): Promise<TaskRow | undefined> => {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
    return row;
  },

  findDetailed: async (db: DbOrTx, id: string) => {
    const rows = await attachLabels(db, await withJoins(db).where(eq(tasks.id, id)));
    return rows[0];
  },

  insert: async (db: DbOrTx, values: NewTaskRow) => {
    const [row] = await db.insert(tasks).values(values).returning();
    return row!;
  },

  update: async (db: DbOrTx, id: string, patch: Partial<NewTaskRow>) => {
    const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(tasks).where(eq(tasks.id, id)),

  labelIds: async (db: DbOrTx, taskId: string) =>
    (await db.select({ id: taskLabels.labelId }).from(taskLabels).where(eq(taskLabels.taskId, taskId))).map(
      (r) => r.id,
    ),

  setLabels: async (db: DbOrTx, taskId: string, labelIds: string[]) => {
    await db.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
    if (labelIds.length) await db.insert(taskLabels).values(labelIds.map((labelId) => ({ taskId, labelId })));
  },

  countsByStatusCategory: async (db: DbOrTx, projectId: string) => {
    const rows = await db
      .select({ category: statuses.category, n: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(eq(tasks.projectId, projectId))
      .groupBy(statuses.category);
    return Object.fromEntries(rows.map((r) => [r.category, r.n])) as Record<string, number>;
  },

  /** One query for every project card: `{ projectId: { category: n } }`. */
  countsByStatusCategoryForProjects: async (db: DbOrTx, projectIds: string[]) => {
    const out: Record<string, Record<string, number>> = Object.fromEntries(projectIds.map((id) => [id, {}]));
    if (!projectIds.length) return out;
    const rows = await db
      .select({ projectId: tasks.projectId, category: statuses.category, n: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(inArray(tasks.projectId, projectIds))
      .groupBy(tasks.projectId, statuses.category);
    for (const r of rows) out[r.projectId]![r.category] = r.n;
    return out;
  },
};

export type TaskListItem = Awaited<ReturnType<typeof tasksRepo.listByProject>>[number];

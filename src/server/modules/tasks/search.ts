import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import type { Ctx } from "@/server/core/context";
import type { DbOrTx } from "@/server/db/client";
import type { StatusCategory } from "@/shared/domain";
import { projects } from "@/server/modules/projects/schema";
import { statuses } from "@/server/modules/statuses/schema";
import { tasks } from "./schema";
import type { SearchTasksInput } from "./validation";

export interface ParsedTaskQuery {
  /** `ACME-2`, `acme 2`, `acme2` → { projectKey: "ACME", number: 2 }. */
  key?: { projectKey: string; number: number };
  /** Bare digits, only when a current Project is known. */
  number?: number;
  /** Trimmed query, always used for the title substring match. */
  text: string;
}

// Project keys are ^[A-Z][A-Z0-9]{1,5}$ (may contain digits, e.g. F1AB), so a separator makes the split
// unambiguous; without a separator only a letters-only key is accepted (acme2 → ACME-2, F1AB1 → title search).
const KEY_WITH_SEPARATOR = /^([a-z][a-z0-9]*)[-\s](\d+)$/i;
const KEY_NO_SEPARATOR = /^([a-z]+)(\d+)$/i;
const BARE_NUMBER = /^\d+$/;

export function parseTaskQuery(q: string, currentProjectId?: string): ParsedTaskQuery {
  const text = q.trim();
  const m = KEY_WITH_SEPARATOR.exec(text) ?? KEY_NO_SEPARATOR.exec(text);
  if (m) return { key: { projectKey: m[1]!.toUpperCase(), number: Number(m[2]) }, text };
  if (currentProjectId && BARE_NUMBER.test(text)) return { number: Number(text), text };
  return { text };
}

/** Escape LIKE metacharacters so user input is matched literally (Postgres default escape is `\`). */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface TaskSearchResult {
  id: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  number: number;
  title: string;
  status: { name: string; category: StatusCategory; color: string };
}

/** Repository-level query: owned, non-archived Projects only; key hits rank above title hits. */
export async function searchTasksQuery(
  db: DbOrTx,
  ownerId: string,
  input: { q: string; currentProjectId?: string; limit: number },
): Promise<TaskSearchResult[]> {
  const parsed = parseTaskQuery(input.q, input.currentProjectId);

  const keyHits: SQL[] = [];
  if (parsed.key)
    keyHits.push(
      and(sql`lower(${projects.key}) = ${parsed.key.projectKey.toLowerCase()}`, eq(tasks.number, parsed.key.number))!,
    );
  if (parsed.number !== undefined && input.currentProjectId)
    keyHits.push(and(eq(tasks.projectId, input.currentProjectId), eq(tasks.number, parsed.number))!);
  const keyHit: SQL = keyHits.length ? or(...keyHits)! : sql`false`;
  const titleHit = ilike(tasks.title, `%${escapeLike(parsed.text)}%`);
  const inCurrent: SQL = input.currentProjectId ? eq(tasks.projectId, input.currentProjectId) : sql`false`;
  const rank = sql<number>`case when ${keyHit} then 0 when ${inCurrent} then 1 else 2 end`;

  return db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      projectKey: projects.key,
      projectName: projects.name,
      number: tasks.number,
      title: tasks.title,
      status: { name: statuses.name, category: statuses.category, color: statuses.color },
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .where(and(eq(projects.ownerId, ownerId), ne(projects.status, "archived"), or(keyHit, titleHit)))
    .orderBy(rank, desc(tasks.updatedAt), asc(tasks.number))
    .limit(input.limit);
}

/**
 * Stateless cross-Project read. There is no single Project to `assertOwnsProject` against;
 * ownership is enforced by the `projects.ownerId = ctx.userId` join. `currentProjectId` is
 * only a ranking / bare-number hint — a foreign id simply never matches.
 */
export const searchTasks = (ctx: Ctx, input: SearchTasksInput) =>
  searchTasksQuery(ctx.db, ctx.userId, { q: input.q, currentProjectId: input.currentProjectId, limit: input.limit });

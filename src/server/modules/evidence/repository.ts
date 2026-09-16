import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { milestones } from "@/server/modules/milestones/schema";
import { risks } from "@/server/modules/risks/schema";
import { tasks } from "@/server/modules/tasks/schema";
import type { LinkableEntityType } from "@/shared/domain";
import {
  evidence,
  evidenceLinks,
  type EvidenceLinkRow,
  type EvidenceRow,
  type NewEvidenceLinkRow,
  type NewEvidenceRow,
} from "./schema";

export const evidenceRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    db
      .select()
      .from(evidence)
      .where(eq(evidence.projectId, projectId))
      .orderBy(desc(evidence.sourceDate), desc(evidence.createdAt)),

  findById: async (db: DbOrTx, id: string): Promise<EvidenceRow | undefined> => {
    const [row] = await db.select().from(evidence).where(eq(evidence.id, id));
    return row;
  },

  insert: async (db: DbOrTx, values: NewEvidenceRow) => {
    const [row] = await db.insert(evidence).values(values).returning();
    return row!;
  },

  update: async (db: DbOrTx, id: string, patch: Partial<NewEvidenceRow>) => {
    const [row] = await db.update(evidence).set(patch).where(eq(evidence.id, id)).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(evidence).where(eq(evidence.id, id)),
};

type LinkKey = Pick<EvidenceLinkRow, "evidenceId" | "entityType" | "entityId">;

const linkKey = (k: LinkKey) =>
  and(
    eq(evidenceLinks.evidenceId, k.evidenceId),
    eq(evidenceLinks.entityType, k.entityType),
    eq(evidenceLinks.entityId, k.entityId),
  );

/** `sourceDate` is nullable: sort by the date the artifact refers to, falling back to when it was added. */
const evidenceRecency = desc(sql`coalesce(${evidence.sourceDate}, ${evidence.createdAt}::date)`);

/** Links with both sides labelled in one query (polymorphic side via three left joins). */
const withLabels = (db: DbOrTx) =>
  db
    .select({
      evidenceId: evidenceLinks.evidenceId,
      entityType: sql<LinkableEntityType>`${evidenceLinks.entityType}`,
      entityId: evidenceLinks.entityId,
      projectId: evidenceLinks.projectId,
      createdAt: evidenceLinks.createdAt,
      evidenceTitle: evidence.title,
      evidenceKind: evidence.kind,
      evidenceSourceDate: evidence.sourceDate,
      /** Empty string when the item vanished mid-request; the UI falls back to the type label. */
      entityLabel: sql<string>`coalesce(${tasks.title}, ${risks.title}, ${milestones.name}, '')`,
      entityNumber: sql<number | null>`coalesce(${tasks.number}, ${risks.number})`,
    })
    .from(evidenceLinks)
    .innerJoin(evidence, eq(evidence.id, evidenceLinks.evidenceId))
    .leftJoin(tasks, and(eq(evidenceLinks.entityType, "task"), eq(tasks.id, evidenceLinks.entityId)))
    .leftJoin(risks, and(eq(evidenceLinks.entityType, "risk"), eq(risks.id, evidenceLinks.entityId)))
    .leftJoin(milestones, and(eq(evidenceLinks.entityType, "milestone"), eq(milestones.id, evidenceLinks.entityId)));

export interface LinkTarget {
  entityType: LinkableEntityType;
  entityId: string;
  label: string;
  number: number | null;
}

export const evidenceLinksRepo = {
  listForProject: (db: DbOrTx, projectId: string) =>
    withLabels(db)
      .where(eq(evidenceLinks.projectId, projectId))
      .orderBy(evidenceRecency, desc(evidence.createdAt), asc(evidenceLinks.createdAt)),

  listForEntity: (db: DbOrTx, entityType: LinkableEntityType, entityId: string) =>
    withLabels(db)
      .where(and(eq(evidenceLinks.entityType, entityType), eq(evidenceLinks.entityId, entityId)))
      .orderBy(evidenceRecency, desc(evidence.createdAt), asc(evidenceLinks.createdAt)),

  listForEvidence: (db: DbOrTx, evidenceId: string) =>
    withLabels(db).where(eq(evidenceLinks.evidenceId, evidenceId)).orderBy(asc(evidenceLinks.createdAt)),

  find: async (db: DbOrTx, key: LinkKey): Promise<EvidenceLinkRow | undefined> => {
    const [row] = await db.select().from(evidenceLinks).where(linkKey(key));
    return row;
  },

  /** Returns undefined when the pair already existed (composite PK conflict). */
  insertIgnore: async (db: DbOrTx, values: NewEvidenceLinkRow): Promise<EvidenceLinkRow | undefined> => {
    const [row] = await db.insert(evidenceLinks).values(values).onConflictDoNothing().returning();
    return row;
  },

  delete: (db: DbOrTx, key: LinkKey) => db.delete(evidenceLinks).where(linkKey(key)).returning(),

  /** Called by the task/risk/milestone services inside their delete transaction. */
  deleteForEntity: (db: DbOrTx, entityType: LinkableEntityType, entityId: string) =>
    db.delete(evidenceLinks).where(and(eq(evidenceLinks.entityType, entityType), eq(evidenceLinks.entityId, entityId))),

  /** Picker data for the Evidence page: every linkable item in the project, three cheap selects. */
  listTargets: async (db: DbOrTx, projectId: string): Promise<LinkTarget[]> => {
    const [t, r, m] = await Promise.all([
      db
        .select({ id: tasks.id, number: tasks.number, title: tasks.title })
        .from(tasks)
        .where(eq(tasks.projectId, projectId))
        .orderBy(asc(tasks.number)),
      db
        .select({ id: risks.id, number: risks.number, title: risks.title })
        .from(risks)
        .where(eq(risks.projectId, projectId))
        .orderBy(asc(risks.number)),
      db
        .select({ id: milestones.id, name: milestones.name })
        .from(milestones)
        .where(eq(milestones.projectId, projectId))
        .orderBy(asc(milestones.dueDate), asc(milestones.name)),
    ]);
    return [
      ...t.map((x) => ({ entityType: "task" as const, entityId: x.id, label: x.title, number: x.number })),
      ...r.map((x) => ({ entityType: "risk" as const, entityId: x.id, label: x.title, number: x.number })),
      ...m.map((x) => ({ entityType: "milestone" as const, entityId: x.id, label: x.name, number: null })),
    ];
  },

  /** Light rows for the item-dialog picker. */
  listSummaries: (db: DbOrTx, projectId: string) =>
    db
      .select({ id: evidence.id, title: evidence.title, kind: evidence.kind, sourceDate: evidence.sourceDate })
      .from(evidence)
      .where(eq(evidence.projectId, projectId))
      .orderBy(evidenceRecency, desc(evidence.createdAt)),
};

export type ProjectEvidenceLink = Awaited<ReturnType<typeof evidenceLinksRepo.listForProject>>[number];
export type EvidenceSummary = Awaited<ReturnType<typeof evidenceLinksRepo.listSummaries>>[number];

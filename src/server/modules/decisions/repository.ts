import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { activityEvents } from "@/server/modules/activity/schema";
import { comments } from "@/server/modules/comments/schema";
import { evidence } from "@/server/modules/evidence/schema";
import { people } from "@/server/modules/people/schema";
import type { DecisionEdgeKind } from "@/shared/domain";
import {
  assumptions,
  decisionEdges,
  decisionSources,
  decisions,
  type AssumptionRow,
  type DecisionEdgeRow,
  type DecisionRow,
  type NewAssumptionRow,
  type NewDecisionEdgeRow,
  type NewDecisionRow,
  type NewDecisionSourceRow,
} from "./schema";

const withOwner = (db: DbOrTx) =>
  db.select({ decision: decisions, owner: people }).from(decisions).leftJoin(people, eq(people.id, decisions.ownerId));

export const decisionsRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    withOwner(db).where(eq(decisions.projectId, projectId)).orderBy(desc(decisions.decidedOn), desc(decisions.number)),

  findById: async (db: DbOrTx, id: string): Promise<DecisionRow | undefined> => {
    const [row] = await db.select().from(decisions).where(eq(decisions.id, id));
    return row;
  },

  insert: async (db: DbOrTx, values: NewDecisionRow) => {
    const [row] = await db.insert(decisions).values(values).returning();
    return row!;
  },

  update: async (db: DbOrTx, id: string, patch: Partial<NewDecisionRow>) => {
    const [row] = await db.update(decisions).set(patch).where(eq(decisions.id, id)).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(decisions).where(eq(decisions.id, id)),
};

export const assumptionsRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    db.select().from(assumptions).where(eq(assumptions.projectId, projectId)).orderBy(asc(assumptions.createdAt)),

  findById: async (db: DbOrTx, id: string): Promise<AssumptionRow | undefined> => {
    const [row] = await db.select().from(assumptions).where(eq(assumptions.id, id));
    return row;
  },

  listByIds: (db: DbOrTx, ids: string[]) =>
    ids.length ? db.select().from(assumptions).where(inArray(assumptions.id, ids)) : Promise.resolve([]),

  insert: async (db: DbOrTx, values: NewAssumptionRow) => {
    const [row] = await db.insert(assumptions).values(values).returning();
    return row!;
  },

  update: async (db: DbOrTx, id: string, patch: Partial<NewAssumptionRow>) => {
    const [row] = await db.update(assumptions).set(patch).where(eq(assumptions.id, id)).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(assumptions).where(eq(assumptions.id, id)),
};

export const edgesRepo = {
  listByProject: (db: DbOrTx, projectId: string) =>
    db.select().from(decisionEdges).where(eq(decisionEdges.projectId, projectId)),

  listByKind: (db: DbOrTx, projectId: string, kind: DecisionEdgeKind) =>
    db
      .select()
      .from(decisionEdges)
      .where(and(eq(decisionEdges.projectId, projectId), eq(decisionEdges.kind, kind))),

  find: async (db: DbOrTx, kind: DecisionEdgeKind, fromId: string, toId: string) => {
    const [row] = await db
      .select()
      .from(decisionEdges)
      .where(and(eq(decisionEdges.kind, kind), eq(decisionEdges.fromId, fromId), eq(decisionEdges.toId, toId)));
    return row as DecisionEdgeRow | undefined;
  },

  /** Edges of one kind arriving at `toId`. */
  listToKind: (db: DbOrTx, kind: DecisionEdgeKind, toId: string) =>
    db
      .select()
      .from(decisionEdges)
      .where(and(eq(decisionEdges.kind, kind), eq(decisionEdges.toId, toId))),

  /** Edges leaving `fromId` of one kind (a Decision has at most one `superseded_by`). */
  listFrom: (db: DbOrTx, kind: DecisionEdgeKind, fromId: string) =>
    db
      .select()
      .from(decisionEdges)
      .where(and(eq(decisionEdges.kind, kind), eq(decisionEdges.fromId, fromId))),

  insert: async (db: DbOrTx, values: NewDecisionEdgeRow) => {
    const [row] = await db.insert(decisionEdges).values(values).returning();
    return row!;
  },

  delete: (db: DbOrTx, id: string) => db.delete(decisionEdges).where(eq(decisionEdges.id, id)),

  /** Every edge touching a node, used when the node is deleted. */
  deleteForNode: (db: DbOrTx, id: string) =>
    db.delete(decisionEdges).where(or(eq(decisionEdges.fromId, id), eq(decisionEdges.toId, id))),
};

export const sourcesRepo = {
  listForDecisions: (db: DbOrTx, decisionIds: string[]) =>
    decisionIds.length
      ? db
          .select()
          .from(decisionSources)
          .where(inArray(decisionSources.decisionId, decisionIds))
          .orderBy(asc(decisionSources.createdAt))
      : Promise.resolve([]),

  listForEdges: (db: DbOrTx, edgeIds: string[]) =>
    edgeIds.length
      ? db.select().from(decisionSources).where(inArray(decisionSources.edgeId, edgeIds))
      : Promise.resolve([]),

  insertMany: (db: DbOrTx, values: NewDecisionSourceRow[]) =>
    values.length ? db.insert(decisionSources).values(values).returning() : Promise.resolve([]),

  deleteForDecision: (db: DbOrTx, decisionId: string) =>
    db.delete(decisionSources).where(and(eq(decisionSources.decisionId, decisionId), isNull(decisionSources.edgeId))),
};

/** What the Source picker can cite: light rows, newest first, bounded. */
export const sourceCandidatesRepo = {
  list: async (db: DbOrTx, projectId: string, limit = 200) => {
    const [ev, cm, ae] = await Promise.all([
      db
        .select({ id: evidence.id, title: evidence.title, kind: evidence.kind, sourceDate: evidence.sourceDate })
        .from(evidence)
        .where(eq(evidence.projectId, projectId))
        .orderBy(desc(evidence.createdAt))
        .limit(limit),
      db
        .select({
          id: comments.id,
          body: comments.body,
          entityType: comments.entityType,
          entityId: comments.entityId,
          saidByName: comments.saidByName,
          saidOn: comments.saidOn,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .where(eq(comments.projectId, projectId))
        .orderBy(desc(comments.createdAt))
        .limit(limit),
      db
        .select({
          id: activityEvents.id,
          entityType: activityEvents.entityType,
          entityLabel: activityEvents.entityLabel,
          action: activityEvents.action,
          field: activityEvents.field,
          occurredAt: activityEvents.occurredAt,
        })
        .from(activityEvents)
        .where(and(eq(activityEvents.projectId, projectId), ne(activityEvents.entityType, "decision")))
        .orderBy(desc(activityEvents.occurredAt))
        .limit(limit),
    ]);
    return { evidence: ev, comments: cm, activityEvents: ae };
  },
};

export type DecisionListItem = Awaited<ReturnType<typeof decisionsRepo.listByProject>>[number];
export type SourceCandidates = Awaited<ReturnType<typeof sourceCandidatesRepo.list>>;

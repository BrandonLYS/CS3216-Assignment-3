import type { Ctx } from "@/server/core/context";
import { compactPatch, diffFields, type FieldChange } from "@/server/core/diff";
import { ConflictError, NotFoundError, ValidationError } from "@/server/core/errors";
import { mutate, type Recorder } from "@/server/core/mutation";
import { nextNumber } from "@/server/core/sequence";
import type { DbOrTx, Tx } from "@/server/db/client";
import { activityRepo } from "@/server/modules/activity/service";
import { commentsRepo } from "@/server/modules/comments/repository";
import { wouldCreateCycle } from "@/server/modules/dependencies/graph";
import { dependenciesRepo } from "@/server/modules/dependencies/repository";
import { evidenceRepo } from "@/server/modules/evidence/repository";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { assertPersonInProject } from "@/server/modules/people/service";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { tasksRepo } from "@/server/modules/tasks/repository";
import { SOURCE_EXCERPT_MAX, labelFor } from "@/shared/domain";
import { assumptionsRepo, decisionsRepo, edgesRepo, sourceCandidatesRepo, sourcesRepo } from "./repository";
import {
  decisions,
  type AssumptionRow,
  type DecisionRow,
  type DecisionSourceRow,
  type NewDecisionSourceRow,
} from "./schema";
import {
  assumptionFieldErrors,
  type AttachAssumptionInput,
  type CreateAssumptionInput,
  type CreateDecisionInput,
  type SourceInput,
  type SupersedeDecisionInput,
  type UpdateDecisionInput,
} from "./validation";

const LABEL_MAX = 120;

/** First non-empty line, truncated by code point so emoji are never split. */
export function firstLine(text: string, max: number): string {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  const chars = Array.from(line);
  return chars.length <= max ? line : `${chars.slice(0, max - 1).join("")}…`;
}

async function getOwned(db: DbOrTx, userId: string, id: string): Promise<DecisionRow> {
  const d = await decisionsRepo.findById(db, id);
  if (!d) throw new NotFoundError("Decision");
  await assertOwnsProject(db, userId, d.projectId);
  return d;
}

async function getOwnedAssumption(db: DbOrTx, userId: string, id: string): Promise<AssumptionRow> {
  const a = await assumptionsRepo.findById(db, id);
  if (!a) throw new NotFoundError("Assumption");
  await assertOwnsProject(db, userId, a.projectId);
  return a;
}

/**
 * Turn Source inputs into rows: each must live in this Project, and `label` / `excerpt` are
 * snapshots computed here, never trusted from the caller (ADR 0008).
 */
async function resolveSources(
  tx: Tx,
  projectId: string,
  inputs: SourceInput[],
): Promise<Omit<NewDecisionSourceRow, "decisionId" | "edgeId">[]> {
  if (!inputs.length) throw new ValidationError("Add at least one source", { sources: ["Add at least one source"] });
  const bad = () =>
    new ValidationError("Source is not in this project", { sources: ["Source is not in this project"] });
  const seen = new Set<string>();
  const out: Omit<NewDecisionSourceRow, "decisionId" | "edgeId">[] = [];
  for (const s of inputs) {
    const key = `${s.kind}:${s.entityId}:${s.passageId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = { projectId, kind: s.kind, entityId: s.entityId, passageId: s.passageId ?? null };
    if (s.kind === "evidence") {
      const e = await evidenceRepo.findById(tx, s.entityId);
      if (!e || e.projectId !== projectId) throw bad();
      const text = e.body ?? e.extractedText ?? e.notes ?? "";
      out.push({ ...base, label: e.title, excerpt: firstLine(text, SOURCE_EXCERPT_MAX) });
    } else if (s.kind === "comment") {
      const c = await commentsRepo.findById(tx, s.entityId);
      if (!c || c.projectId !== projectId) throw bad();
      const who = c.saidByName ? `${c.saidByName}: ` : "";
      out.push({
        ...base,
        label: firstLine(`${who}${c.body}`, LABEL_MAX),
        excerpt: firstLine(c.body, SOURCE_EXCERPT_MAX),
      });
    } else {
      const ev = await activityRepo.findById(tx, s.entityId);
      if (!ev || ev.projectId !== projectId) throw bad();
      const what = ev.field ? `${labelFor(ev.field)} changed` : ev.action;
      const label = `${labelFor(ev.entityType)} "${ev.entityLabel}" ${what}`;
      const excerpt = ev.field ? `${JSON.stringify(ev.oldValue)} → ${JSON.stringify(ev.newValue)}` : label;
      out.push({ ...base, label: firstLine(label, LABEL_MAX), excerpt: firstLine(excerpt, SOURCE_EXCERPT_MAX) });
    }
  }
  return out;
}

const copyToEdge = (sources: DecisionSourceRow[], edgeId: string): NewDecisionSourceRow[] =>
  sources.map(({ projectId, kind, entityId, passageId, excerpt, label }) => ({
    projectId,
    edgeId,
    kind,
    entityId,
    passageId,
    excerpt,
    label,
  }));

/** Validate the typed target of an Assumption lives in the Project; returns a display label. */
async function assertTargetInProject(tx: Tx, input: CreateAssumptionInput) {
  const { projectId, subtype, targetType, targetId } = input;
  const shapeErrors = assumptionFieldErrors(input);
  if (Object.keys(shapeErrors).length) throw new ValidationError("Check the assumption target", shapeErrors);
  const invalid = () => new ValidationError("Invalid target", { targetId: ["Not in this project"] });
  if (subtype === "external_rule") return;
  if (targetType === "person") return assertPersonInProject(tx, projectId, targetId, "targetId");
  if (targetType === "task") {
    const t = await tasksRepo.findById(tx, targetId!);
    if (!t || t.projectId !== projectId) throw invalid();
    return;
  }
  if (targetType === "milestone") {
    const m = await milestonesRepo.findById(tx, targetId!);
    if (!m || m.projectId !== projectId) throw invalid();
    return;
  }
  const dep = await dependenciesRepo.findById(tx, targetId!);
  if (!dep || dep.projectId !== projectId) throw invalid();
}

async function supportedStatements(tx: Tx, decisionId: string) {
  const edges = await edgesRepo.listToKind(tx, "supports", decisionId);
  if (!edges.length) return [] as string[];
  const rows = await assumptionsRepo.listByIds(
    tx,
    edges.map((e) => e.fromId),
  );
  return rows.map((a) => a.statement);
}

async function attach(tx: Tx, rec: Recorder, decision: DecisionRow, assumption: AssumptionRow) {
  const before = await supportedStatements(tx, decision.id);
  const edge = await edgesRepo.insert(tx, {
    projectId: decision.projectId,
    kind: "supports",
    fromType: "assumption",
    fromId: assumption.id,
    toType: "decision",
    toId: decision.id,
  });
  const sources = await sourcesRepo.listForDecisions(tx, [decision.id]);
  await sourcesRepo.insertMany(tx, copyToEdge(sources, edge.id));
  rec.updated("decision", decision.projectId, decision.id, decision.title, [
    { field: "assumptions", oldValue: before, newValue: [...before, assumption.statement] },
  ]);
  return edge;
}

/** Delete an Assumption that no longer supports any Decision. */
async function deleteIfOrphan(tx: Tx, rec: Recorder, assumption: AssumptionRow) {
  const remaining = await edgesRepo.listFrom(tx, "supports", assumption.id);
  if (remaining.length) return false;
  await edgesRepo.deleteForNode(tx, assumption.id);
  await assumptionsRepo.delete(tx, assumption.id);
  rec.deleted("assumption", assumption.projectId, assumption.id, firstLine(assumption.statement, LABEL_MAX));
  return true;
}

const statusChange = (from: DecisionRow["status"], to: DecisionRow["status"]): FieldChange[] => [
  { field: "status", oldValue: from, newValue: to },
];

/** Link `older` as superseded by `newer`; both already ownership-checked and in the same Project. */
async function linkSupersedes(tx: Tx, rec: Recorder, newer: DecisionRow, olderId: string | null) {
  const current = (await edgesRepo.listToKind(tx, "superseded_by", newer.id))[0];
  if (current?.fromId === olderId) return;
  if (current) {
    const older = await decisionsRepo.findById(tx, current.fromId);
    await edgesRepo.delete(tx, current.id);
    if (older && older.status === "superseded") {
      await decisionsRepo.update(tx, older.id, { status: "active" });
      rec.updated("decision", older.projectId, older.id, older.title, statusChange("superseded", "active"));
    }
    rec.updated("decision", newer.projectId, newer.id, newer.title, [
      { field: "supersedes", oldValue: older?.title ?? null, newValue: null },
    ]);
  }
  if (!olderId) return;
  if (olderId === newer.id)
    throw new ValidationError("A decision cannot supersede itself", { supersedesId: ["Invalid"] });
  const older = await decisionsRepo.findById(tx, olderId);
  if (!older || older.projectId !== newer.projectId) {
    throw new ValidationError("Decision not in this project", { supersedesId: ["Invalid"] });
  }
  const existing = await edgesRepo.listFrom(tx, "superseded_by", older.id);
  if (existing.length) throw new ConflictError(`"${older.title}" is already superseded by another decision`);
  const all = await edgesRepo.listByKind(tx, newer.projectId, "superseded_by");
  const edges = all.map((e) => ({ predecessorId: e.fromId, successorId: e.toId }));
  if (wouldCreateCycle(edges, older.id, newer.id)) {
    throw new ConflictError(`"${older.title}" already comes after "${newer.title}" - that would be a cycle`);
  }
  const edge = await edgesRepo.insert(tx, {
    projectId: newer.projectId,
    kind: "superseded_by",
    fromType: "decision",
    fromId: older.id,
    toType: "decision",
    toId: newer.id,
  });
  const sources = await sourcesRepo.listForDecisions(tx, [newer.id]);
  await sourcesRepo.insertMany(tx, copyToEdge(sources, edge.id));
  await decisionsRepo.update(tx, older.id, { status: "superseded" });
  rec.updated("decision", older.projectId, older.id, older.title, statusChange(older.status, "superseded"));
  rec.updated("decision", newer.projectId, newer.id, newer.title, [
    { field: "supersedes", oldValue: null, newValue: older.title },
  ]);
}

export const decisionsService = {
  /** Decisions with owner, their Assumptions, Sources and supersede links, newest first. */
  list: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    const [rows, assumptions, edges] = await Promise.all([
      decisionsRepo.listByProject(ctx.db, projectId),
      assumptionsRepo.listByProject(ctx.db, projectId),
      edgesRepo.listByProject(ctx.db, projectId),
    ]);
    const decisionSources = await sourcesRepo.listForDecisions(
      ctx.db,
      rows.map((r) => r.decision.id),
    );
    const byId = new Map(assumptions.map((a) => [a.id, a]));
    return rows.map(({ decision, owner }) => ({
      decision,
      owner,
      assumptions: edges
        .filter((e) => e.kind === "supports" && e.toId === decision.id)
        .map((e) => byId.get(e.fromId))
        .filter((a): a is AssumptionRow => Boolean(a)),
      sources: decisionSources.filter((s) => s.decisionId === decision.id),
      supersededById: edges.find((e) => e.kind === "superseded_by" && e.fromId === decision.id)?.toId ?? null,
      supersedesId: edges.find((e) => e.kind === "superseded_by" && e.toId === decision.id)?.fromId ?? null,
    }));
  },

  get: (ctx: Ctx, id: string) => getOwned(ctx.db, ctx.userId, id),

  /** Every Assumption in the Project, for the "attach existing" picker. */
  listAssumptions: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return assumptionsRepo.listByProject(ctx.db, projectId);
  },

  sourceCandidates: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return sourceCandidatesRepo.list(ctx.db, projectId);
  },

  create: (ctx: Ctx, { sources, supersedesId, ...input }: CreateDecisionInput) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      await assertPersonInProject(tx, input.projectId, input.ownerId, "ownerId");
      const resolved = await resolveSources(tx, input.projectId, sources);
      const number = await nextNumber(tx, input.projectId, decisions, decisions.number, decisions.projectId);
      const decision = await decisionsRepo.insert(tx, { ...input, number });
      await sourcesRepo.insertMany(
        tx,
        resolved.map((s) => ({ ...s, decisionId: decision.id })),
      );
      rec.created("decision", input.projectId, decision.id, decision.title);
      if (supersedesId) await linkSupersedes(tx, rec, decision, supersedesId);
      return decision;
    }),

  update: (ctx: Ctx, { id, sources, ...patch }: UpdateDecisionInput) =>
    mutate(ctx, async (tx, rec) => {
      const before = await getOwned(tx, ctx.userId, id);
      const clean = compactPatch(patch);
      await assertPersonInProject(tx, before.projectId, clean.ownerId, "ownerId");
      if (clean.status && before.status === "superseded") {
        throw new ValidationError("A superseded decision keeps its status until the link is removed", {
          status: ["Superseded"],
        });
      }
      const changes = diffFields(before, clean);
      if (sources) {
        const resolved = await resolveSources(tx, before.projectId, sources);
        const current = await sourcesRepo.listForDecisions(tx, [id]);
        const oldLabels = current.map((s) => s.label);
        const newLabels = resolved.map((s) => s.label);
        if (JSON.stringify(oldLabels) !== JSON.stringify(newLabels)) {
          await sourcesRepo.deleteForDecision(tx, id);
          await sourcesRepo.insertMany(
            tx,
            resolved.map((s) => ({ ...s, decisionId: id })),
          );
          changes.push({ field: "sources", oldValue: oldLabels, newValue: newLabels });
        }
      }
      if (!changes.length) return before;
      const after = Object.keys(clean).length ? await decisionsRepo.update(tx, id, clean) : before;
      rec.updated("decision", before.projectId, id, after.title, changes);
      return after;
    }),

  delete: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const d = await getOwned(tx, ctx.userId, id);
      const supports = await edgesRepo.listToKind(tx, "supports", id);
      const supersededBy = await edgesRepo.listToKind(tx, "superseded_by", id);
      await edgesRepo.deleteForNode(tx, id);
      await decisionsRepo.delete(tx, id);
      rec.deleted("decision", d.projectId, id, d.title);
      for (const e of supersededBy) {
        const older = await decisionsRepo.findById(tx, e.fromId);
        if (older?.status === "superseded") {
          await decisionsRepo.update(tx, older.id, { status: "active" });
          rec.updated("decision", older.projectId, older.id, older.title, statusChange("superseded", "active"));
        }
      }
      for (const e of supports) {
        const a = await assumptionsRepo.findById(tx, e.fromId);
        if (a) await deleteIfOrphan(tx, rec, a);
      }
    }),

  supersede: (ctx: Ctx, { id, supersedesId }: SupersedeDecisionInput) =>
    mutate(ctx, async (tx, rec) => {
      const newer = await getOwned(tx, ctx.userId, id);
      await linkSupersedes(tx, rec, newer, supersedesId);
      return newer;
    }),

  createAssumption: (ctx: Ctx, input: CreateAssumptionInput) =>
    mutate(ctx, async (tx, rec) => {
      const decision = await getOwned(tx, ctx.userId, input.decisionId);
      if (decision.projectId !== input.projectId) throw new NotFoundError("Decision");
      await assertTargetInProject(tx, input);
      const { decisionId: _decisionId, ...values } = input;
      void _decisionId;
      const assumption = await assumptionsRepo.insert(tx, {
        ...values,
        targetType: values.targetType ?? null,
        targetId: values.targetId ?? null,
        targetField: values.targetField ?? null,
        assumedUntil: values.assumedUntil ?? null,
      });
      rec.created("assumption", input.projectId, assumption.id, firstLine(assumption.statement, LABEL_MAX));
      await attach(tx, rec, decision, assumption);
      return assumption;
    }),

  attachAssumption: (ctx: Ctx, { decisionId, assumptionId }: AttachAssumptionInput) =>
    mutate(ctx, async (tx, rec) => {
      const decision = await getOwned(tx, ctx.userId, decisionId);
      const assumption = await getOwnedAssumption(tx, ctx.userId, assumptionId);
      if (assumption.projectId !== decision.projectId) throw new NotFoundError("Assumption");
      if (await edgesRepo.find(tx, "supports", assumption.id, decision.id)) return assumption;
      await attach(tx, rec, decision, assumption);
      return assumption;
    }),

  detachAssumption: (ctx: Ctx, { decisionId, assumptionId }: AttachAssumptionInput) =>
    mutate(ctx, async (tx, rec) => {
      const decision = await getOwned(tx, ctx.userId, decisionId);
      const assumption = await getOwnedAssumption(tx, ctx.userId, assumptionId);
      const edge = await edgesRepo.find(tx, "supports", assumption.id, decision.id);
      if (!edge) return;
      const before = await supportedStatements(tx, decision.id);
      await edgesRepo.delete(tx, edge.id);
      rec.updated("decision", decision.projectId, decision.id, decision.title, [
        { field: "assumptions", oldValue: before, newValue: before.filter((s) => s !== assumption.statement) },
      ]);
      await deleteIfOrphan(tx, rec, assumption);
    }),

  retireAssumption: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const a = await getOwnedAssumption(tx, ctx.userId, id);
      if (a.state === "retired") return a;
      const after = await assumptionsRepo.update(tx, id, { state: "retired" });
      rec.updated("assumption", a.projectId, id, firstLine(a.statement, LABEL_MAX), [
        { field: "state", oldValue: a.state, newValue: "retired" },
      ]);
      return after;
    }),
};

export type DecisionListItem = Awaited<ReturnType<typeof decisionsService.list>>[number];

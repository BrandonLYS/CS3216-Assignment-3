import { createHash } from "node:crypto";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { Ctx } from "@/server/core/context";
import { ConflictError, NotFoundError } from "@/server/core/errors";
import { conversationsRepo, messagesRepo } from "@/server/modules/assistant/repository";
import { commentsRepo } from "@/server/modules/comments/repository";
import { decisionsService } from "@/server/modules/decisions/service";
import type { CreateDecisionInput } from "@/server/modules/decisions/validation";
import { transcriptText } from "@/server/modules/evidence/passages";
import { evidenceRepo, passagesRepo } from "@/server/modules/evidence/repository";
import { evidenceText } from "@/server/modules/evidence/service";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { peopleRepo } from "@/server/modules/people/repository";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { tasksRepo } from "@/server/modules/tasks/repository";
import type { DbOrTx } from "@/server/db/client";
import type { ProposalExtractor, ProposalPass } from "@/shared/domain";
import {
  itemProposalGenerated,
  itemProposalRejected,
  proposalGenerated,
  proposalRejected,
  today,
  type PassTrigger,
} from "./analytics";
import { pickExtractor, type Extract, type ExtractSource } from "./extract";
import { heuristicExtractItems, pickExtractors, type ExtractItems } from "./extract-items";
import { itemProposalsRepo, passSourcesRepo, proposalsRepo } from "./repository";
import type { ItemProposalRow, ProposalRow } from "./schema";
import { attachPassages, traceItems, traceProposals, type TraceRefs } from "./trace";

export type DecisionPassOutcome =
  | { skipped: "not_configured" | "nothing_new" | "failed"; proposalId?: string }
  | {
      extractor: ProposalExtractor;
      sourcesPassed: number;
      proposed: number;
      discarded: number;
      proposalId?: string;
    };

/** The item side of a pass (#114); `tasks` and `milestones` count inserted rows. */
export type ItemPassOutcome =
  | { skipped: "not_configured" | "nothing_new" | "failed" }
  | { extractor: ProposalExtractor; sourcesPassed: number; tasks: number; milestones: number; discarded: number };

/** The Decision side at the top level, as before #114, and the item side under `items`. */
export type PassOutcome = DecisionPassOutcome & { items: ItemPassOutcome };

type Candidate = ExtractSource & { textHash: string };

const hashOf = (text: string) => createHash("sha1").update(text).digest("hex");

const transcriptOf = (messages: UIMessage[]) =>
  messages
    .map((m) => {
      const text = m.parts
        .map((p) => (p.type === "text" ? p.text : isToolUIPart(p) ? `[${getToolName(p)}]` : ""))
        .filter(Boolean)
        .join(" ");
      return `${m.role}: ${text}`;
    })
    .join("\n");

/** Overrides the PM may apply on a one-click accept (the dialog path posts a full form instead). */
export type AcceptOverrides = Partial<
  Pick<CreateDecisionInput, "title" | "decidedOn" | "ownerId" | "context" | "chosen" | "alternatives" | "revisitWhen">
>;

/**
 * The Proposal pass (issue #39, ADR 0008): reads Evidence and Comments not yet passed, asks
 * an extractor for Decision candidates, keeps only traceable ones and stores them pending.
 * Never writes to the graph; `accept` does, through `decisionsService` under `via: "assistant"`.
 */
export const proposalsService = {
  /** True when a pass can run at all (a model is configured or the heuristic is selected). */
  enabled: async (ctx: Ctx) => (await pickExtractor(ctx)) !== null,

  /**
   * `trigger` is required: an unnamed trigger is the mis-attribution this funnel exists to end.
   * The Decision and item extractors read the same Sources but keep their own bookkeeping, and
   * each side catches its own failures, so one failing never blocks or re-runs the other.
   */
  runPass: async (
    ctx: Ctx,
    projectId: string,
    opts: { trigger: PassTrigger; extract?: Extract; extractItems?: ExtractItems },
  ): Promise<PassOutcome> => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    const picked = await pickExtractors(ctx);
    const extract = opts.extract ?? picked?.extract;
    // An injected Decision extractor is a test or script: keep the item side deterministic too.
    const extractItems = opts.extractItems ?? (opts.extract ? heuristicExtractItems : picked?.extractItems);
    const extractorName: ProposalExtractor = opts.extract ? "heuristic" : (picked?.name ?? "heuristic");
    const itemExtractorName: ProposalExtractor =
      opts.extractItems || opts.extract ? "heuristic" : (picked?.name ?? "heuristic");
    if (!extract || !extractItems) return { skipped: "not_configured", items: { skipped: "not_configured" } };

    const [evidence, comments, passed, passages] = await Promise.all([
      evidenceRepo.listByProject(ctx.db, projectId),
      commentsRepo.listByProject(ctx.db, projectId),
      passSourcesRepo.listForProject(ctx.db, projectId),
      passagesRepo.listForProject(ctx.db, projectId),
    ]);
    const passagesByEvidence = new Map<string, typeof passages>();
    for (const p of passages)
      passagesByEvidence.set(p.evidenceId, [...(passagesByEvidence.get(p.evidenceId) ?? []), p]);
    const all: Candidate[] = [];
    // Transcripts first: they carry the stated reasoning (issue #42). The hash stays on the raw text so
    // "already read" is independent of segmentation; the extractor reads label-free Passage text so its
    // excerpts sit inside one Passage.
    const ordered = [...evidence].sort((a, b) => Number(b.kind === "transcript") - Number(a.kind === "transcript"));
    for (const e of ordered) {
      const raw = evidenceText(e).trim();
      if (!raw) continue;
      const own = passagesByEvidence.get(e.id);
      const text = own?.length ? transcriptText(own) : raw;
      all.push({ kind: "evidence", entityId: e.id, title: e.title, evidenceKind: e.kind, text, textHash: hashOf(raw) });
    }
    for (const c of comments) {
      const text = c.body.trim();
      if (!text) continue;
      all.push({
        kind: "comment",
        entityId: c.id,
        title: `Comment${c.saidByName ? ` by ${c.saidByName}` : ""}`,
        text,
        textHash: hashOf(text),
      });
    }
    const unread = (pass: ProposalPass) => {
      const seen = new Map(passed.filter((p) => p.pass === pass).map((p) => [`${p.kind}:${p.entityId}`, p.textHash]));
      return all.filter((c) => seen.get(`${c.kind}:${c.entityId}`) !== c.textHash);
    };
    const decisionCandidates = unread("decision");
    const itemCandidates = unread("item");

    // A manual pass ends in review: it points at the newest pending Proposal, whichever pass raised it.
    // Read after the writes committed, so a failure here only loses the pointer, never the outcome.
    const firstPending = async () =>
      opts.trigger === "manual"
        ? (await proposalsRepo.listByProject(ctx.db, projectId, "pending").catch(() => []))[0]?.id
        : undefined;
    const nothingNew = async (): Promise<DecisionPassOutcome> => {
      const proposalId = await firstPending();
      return proposalId ? { skipped: "nothing_new", proposalId } : { skipped: "nothing_new" };
    };
    if (!decisionCandidates.length && !itemCandidates.length)
      return { ...(await nothingNew()), items: { skipped: "nothing_new" } };

    // Only what both sides need is loaded here; each side loads the rest inside its own try.
    const [people, milestones, tasks] = await Promise.all([
      peopleRepo.listByProject(ctx.db, projectId),
      milestonesRepo.listByProject(ctx.db, projectId),
      tasksRepo.listByProject(ctx.db, projectId),
    ]);
    const refs: TraceRefs = {
      people: people.map((p) => ({ id: p.id, name: p.name })),
      milestones: milestones.map((m) => ({ id: m.milestone.id, name: m.milestone.name })),
      tasks: tasks.map((t) => ({ id: t.task.id, title: t.task.title })),
    };
    const context = {
      people: refs.people.map((p) => p.name),
      milestones: refs.milestones.map((m) => m.name),
      tasks: refs.tasks.map((t) => t.title),
      conversation: "",
    };
    const extractorInput = (candidates: Candidate[], conversation = "") => ({
      sources: candidates.map(({ kind, entityId, title, evidenceKind, text }) => ({
        kind,
        entityId,
        title,
        evidenceKind,
        text,
      })),
      context: { ...context, conversation },
      telemetry: {
        userId: ctx.userId,
        properties: { project_id: projectId, trigger: opts.trigger, source_count: candidates.length },
      },
    });
    const markRead = (tx: DbOrTx, pass: ProposalPass, candidates: Candidate[]) =>
      passSourcesRepo.upsertMany(
        tx,
        candidates.map((c) => ({ projectId, pass, kind: c.kind, entityId: c.entityId, textHash: c.textHash })),
      );

    const decisionPass = async (): Promise<DecisionPassOutcome> => {
      if (!decisionCandidates.length) return nothingNew();
      let inserted: ProposalRow[];
      let discarded: number;
      try {
        const conversation = await conversationsRepo
          .latest(ctx.db, ctx.userId, projectId)
          .then((c) => c ?? conversationsRepo.create(ctx.db, ctx.userId, projectId));
        const recent = (await messagesRepo.listByConversation(ctx.db, conversation.id)).slice(-12);
        const transcript = transcriptOf(recent.map((r) => ({ id: r.id, role: r.role, parts: r.parts }) as UIMessage));
        const raw = await extract(extractorInput(decisionCandidates, transcript));
        const traced = traceProposals(raw.proposals, decisionCandidates, refs);
        const kept = attachPassages(traced.kept, passagesByEvidence);
        discarded = traced.discarded;
        // Bookkeeping and the new Proposals land together, after the extractor returned. Two passes
        // racing on one Project (two quick saves) are safe: the unique keys absorb the loser.
        inserted = await ctx.db.transaction(async (tx) => {
          await markRead(tx, "decision", decisionCandidates);
          return proposalsRepo.insertMany(
            tx,
            kept.map((k) => ({ ...k, projectId, extractor: extractorName })),
          );
        });
      } catch (e) {
        console.error("Proposal pass failed", e);
        return { skipped: "failed" };
      }
      const outcome = {
        extractor: extractorName,
        sourcesPassed: decisionCandidates.length,
        proposed: inserted.length,
        discarded,
      };
      await proposalGenerated(ctx, {
        ...outcome,
        projectId,
        trigger: opts.trigger,
        sourceKinds: {
          evidence: decisionCandidates.filter((c) => c.kind === "evidence").length,
          comment: decisionCandidates.filter((c) => c.kind === "comment").length,
        },
      });
      const proposalId = opts.trigger === "manual" ? await firstPending() : inserted[0]?.id;
      return proposalId ? { ...outcome, proposalId } : outcome;
    };

    const itemPass = async (): Promise<ItemPassOutcome> => {
      if (!itemCandidates.length) return { skipped: "nothing_new" };
      let inserted: ItemProposalRow[];
      let discarded: number;
      try {
        // The Conversation stays out of the item prompt (ADR 0015).
        const raw = await extractItems(extractorInput(itemCandidates));
        const itemRows = await itemProposalsRepo.listByProject(ctx.db, projectId);
        const known = itemRows.map((r) => ({
          kind: r.kind,
          title: "title" in r.fields ? r.fields.title : r.fields.name,
        }));
        const traced = traceItems(raw, itemCandidates, refs, known);
        const kept = attachPassages(traced.kept, passagesByEvidence);
        discarded = traced.discarded;
        inserted = await ctx.db.transaction(async (tx) => {
          await markRead(tx, "item", itemCandidates);
          return itemProposalsRepo.insertMany(
            tx,
            kept.map((k) => ({ ...k, projectId, extractor: itemExtractorName })),
          );
        });
      } catch (e) {
        console.error("Item proposal pass failed", e);
        return { skipped: "failed" };
      }
      const outcome = {
        extractor: itemExtractorName,
        sourcesPassed: itemCandidates.length,
        tasks: inserted.filter((r) => r.kind === "task").length,
        milestones: inserted.filter((r) => r.kind === "milestone").length,
        discarded,
      };
      await itemProposalGenerated(ctx, { ...outcome, projectId, trigger: opts.trigger });
      return outcome;
    };

    const [decisionOutcome, items] = await Promise.all([decisionPass(), itemPass()]);
    return { ...decisionOutcome, items };
  },

  /** Pending Task and Milestone Proposals (#114); review and accept arrive with #115. */
  listPendingItems: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return itemProposalsRepo.listByProject(ctx.db, projectId, "pending");
  },

  /** Kept, not deleted: a rejected item's fingerprint and title stop later passes raising it again. */
  rejectItem: async (ctx: Ctx, id: string): Promise<ItemProposalRow> => {
    const p = await itemProposalsRepo.findById(ctx.db, id);
    if (!p) throw new NotFoundError("Proposal");
    await assertOwnsProject(ctx.db, ctx.userId, p.projectId);
    const [row] = await itemProposalsRepo.markRejected(ctx.db, p.id);
    if (!row) throw new ConflictError("That proposal was already resolved");
    await itemProposalRejected(ctx, row);
    return row;
  },

  listPending: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return proposalsRepo.listByProject(ctx.db, projectId, "pending");
  },

  get: async (ctx: Ctx, id: string): Promise<ProposalRow> => {
    const p = await proposalsRepo.findById(ctx.db, id);
    if (!p) throw new NotFoundError("Proposal");
    await assertOwnsProject(ctx.db, ctx.userId, p.projectId);
    return p;
  },

  /** One-click accept: the Proposal becomes a Decision through the normal service, attributed to the Assistant. */
  accept: async (ctx: Ctx, { id, overrides = {} }: { id: string; overrides?: AcceptOverrides }) => {
    const p = await proposalsService.get(ctx, id);
    if (p.status !== "pending") throw new ConflictError("That proposal was already resolved");
    return decisionsService.create(
      { ...ctx, via: "assistant" },
      {
        projectId: p.projectId,
        title: p.title,
        decidedOn: p.decidedOn ?? today(),
        context: p.context,
        chosen: p.chosen,
        alternatives: p.alternatives,
        revisitWhen: p.revisitWhen,
        ...overrides,
        sources: p.sources,
        assumptions: p.assumptions.map((a) => ({
          statement: a.statement,
          subtype: a.subtype,
          targetType: a.targetType ?? null,
          targetId: a.targetId ?? null,
          targetField: a.targetField ?? null,
          assumedUntil: a.assumedUntil ?? null,
        })),
        proposalId: p.id,
      },
    );
  },

  reject: async (ctx: Ctx, id: string) => {
    const p = await proposalsService.get(ctx, id);
    const [row] = await proposalsRepo.markRejected(ctx.db, p.id);
    if (!row) throw new ConflictError("That proposal was already resolved");
    await proposalRejected(ctx, row);
    return row;
  },

  /**
   * Extraction-quality metric per Project: `proposed` is everything ever raised; `rate` is
   * accepted over the Proposals the PM has acted on, so pending ones do not drag it down.
   */
  stats: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    const counts = await proposalsRepo.countsByStatus(ctx.db, projectId);
    const proposed = counts.pending + counts.accepted + counts.rejected;
    const decided = counts.accepted + counts.rejected;
    return { ...counts, proposed, decided, rate: decided ? counts.accepted / decided : null };
  },
};

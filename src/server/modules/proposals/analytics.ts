import type { Ctx } from "@/server/core/context";
import type { CreateDecisionInput } from "@/server/modules/decisions/validation";
import { capture } from "@/shared/analytics/server";
import type { ProposalExtractor } from "@/shared/domain";
import type { CitableKind } from "./extract";
import type { ProposalRow } from "./schema";

/**
 * The Evidence -> Proposal -> Decision funnel (issue #74). The transitions emit these events,
 * not the action that happened to start them, so a pass scheduled after an Evidence or Comment
 * write counts exactly like one the PM asked for. Payloads carry internal ids and bounded
 * metadata only: never Sources, excerpts, Evidence text, titles or Assumption statements.
 */

export type PassTrigger = "manual" | "automatic";

/** The date a Decision gets when the Proposal states none, as `proposalsService.accept` stamps it. */
export const today = () => new Date().toISOString().slice(0, 10);

const text = (v: string | null | undefined) => (v ?? "").trim();

const sourceKey = (s: { kind: string; entityId: string; passageId?: string | null; excerpt?: string | null }) =>
  [s.kind, s.entityId, s.passageId ?? "", text(s.excerpt)].join("|");

const assumptionKey = (a: {
  statement: string;
  subtype: string;
  targetType?: string | null;
  targetId?: string | null;
  targetField?: string | null;
  assumedUntil?: string | null;
}) =>
  [text(a.statement), a.subtype, a.targetType ?? "", a.targetId ?? "", a.targetField ?? "", a.assumedUntil ?? ""].join(
    "|",
  );

const sameSet = (a: string[], b: string[]) => JSON.stringify(a.toSorted()) === JSON.stringify(b.toSorted());

/**
 * Telemetry never fails a write that already happened, and building a payload is as fallible as
 * sending it: a malformed stored Proposal must not turn a committed acceptance into an error.
 */
async function record(userId: string, event: string, properties: () => Record<string, unknown>) {
  try {
    await capture(userId, event, properties());
  } catch {
    // Includes payload construction; `capture` isolates delivery itself.
  }
}

/**
 * Whether the PM changed the Proposal before accepting it, measured against what was proposed
 * rather than against which path posted it: one-click acceptance submits the Proposal as it
 * stands, and a review form submitted untouched posts the same values.
 * Content the Proposal never stated counts once the PM supplies it: an Owner, a supersede link,
 * and a date other than the one a one-click accept would have stamped on a dateless Proposal.
 */
export function editedBeforeAccept(
  proposal: ProposalRow,
  accepted: CreateDecisionInput,
  /** The date `proposalsService.accept` stamps when the Proposal states none; that is not an edit. */
  stamped = today(),
): boolean {
  const changed =
    text(accepted.title) !== text(proposal.title) ||
    text(accepted.chosen) !== text(proposal.chosen) ||
    text(accepted.context) !== text(proposal.context) ||
    text(accepted.alternatives) !== text(proposal.alternatives) ||
    text(accepted.revisitWhen) !== text(proposal.revisitWhen) ||
    !!accepted.ownerId ||
    !!accepted.supersedesId ||
    accepted.decidedOn !== (proposal.decidedOn ?? stamped);
  if (changed) return true;
  if (!sameSet(accepted.sources.map(sourceKey), proposal.sources.map(sourceKey))) return true;
  return !sameSet((accepted.assumptions ?? []).map(assumptionKey), proposal.assumptions.map(assumptionKey));
}

/**
 * A pass that created nothing - skipped, failed, nothing new, nothing traceable, or the loser of
 * two passes racing on the same Sources - is deliberately silent, so no outcome can inflate the
 * generated count or report a success that did not happen. These events measure created
 * Proposals, never how often a pass ran.
 */
export function proposalGenerated(
  ctx: Ctx,
  pass: {
    projectId: string;
    trigger: PassTrigger;
    extractor: ProposalExtractor;
    /** Rows the insert returned, which is what the funnel counts. */
    proposed: number;
    sourcesPassed: number;
    discarded: number;
    sourceKinds: Record<CitableKind, number>;
  },
) {
  if (pass.proposed < 1) return;
  return record(ctx.userId, "proposal_generated", () => ({
    project_id: pass.projectId,
    trigger: pass.trigger,
    extractor: pass.extractor,
    proposal_count: pass.proposed,
    source_count: pass.sourcesPassed,
    evidence_source_count: pass.sourceKinds.evidence,
    comment_source_count: pass.sourceKinds.comment,
    discarded_count: pass.discarded,
  }));
}

/** Called after the transaction that made the Proposal a Decision committed, from either path. */
export function proposalAccepted(ctx: Ctx, proposal: ProposalRow, accepted: CreateDecisionInput) {
  return record(ctx.userId, "proposal_accepted", () => ({
    project_id: proposal.projectId,
    proposal_id: proposal.id,
    extractor: proposal.extractor,
    edited_before_accept: editedBeforeAccept(proposal, accepted),
  }));
}

/** Called after the conditional update that rejected a still-pending Proposal returned a row. */
export function proposalRejected(ctx: Ctx, proposal: ProposalRow) {
  return record(ctx.userId, "proposal_rejected", () => ({
    project_id: proposal.projectId,
    proposal_id: proposal.id,
    extractor: proposal.extractor,
  }));
}

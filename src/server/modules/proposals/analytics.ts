import type { Ctx } from "@/server/core/context";
import type { CreateDecisionInput } from "@/server/modules/decisions/validation";
import { capture } from "@/shared/analytics/server";
import type { ProposalExtractor } from "@/shared/domain";
import type { ProposalRow } from "./schema";

/**
 * The Evidence -> Proposal -> Decision funnel (issue #74). The transitions emit these events,
 * not the action that happened to start them, so a pass scheduled after an Evidence or Comment
 * write counts exactly like one the PM asked for. Payloads carry internal ids and bounded
 * metadata only: never Sources, excerpts, Evidence text, titles or Assumption statements.
 */

export type PassTrigger = "manual" | "automatic";

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

const same = (a: string[], b: string[]) => a.sort().join("\n") === b.sort().join("\n");

/**
 * Whether the PM changed the Proposal before accepting it, measured against what was proposed
 * rather than against which path posted it: one-click acceptance submits the Proposal as it
 * stands, and a review form submitted untouched posts the same values.
 * `decidedOn` counts only when the Proposal stated one, because accepting a dateless Proposal
 * has to stamp a date and that substitution is not the PM's edit. The Owner is never proposed.
 */
export function editedBeforeAccept(proposal: ProposalRow, accepted: CreateDecisionInput): boolean {
  const changed =
    text(accepted.title) !== text(proposal.title) ||
    text(accepted.chosen) !== text(proposal.chosen) ||
    text(accepted.context) !== text(proposal.context) ||
    text(accepted.alternatives) !== text(proposal.alternatives) ||
    text(accepted.revisitWhen) !== text(proposal.revisitWhen) ||
    (!!proposal.decidedOn && accepted.decidedOn !== proposal.decidedOn);
  if (changed) return true;
  if (!same(accepted.sources.map(sourceKey), proposal.sources.map(sourceKey))) return true;
  return !same((accepted.assumptions ?? []).map(assumptionKey), proposal.assumptions.map(assumptionKey));
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
    created: number;
    sourcesPassed: number;
    discarded: number;
  },
) {
  if (pass.created < 1) return;
  return capture(ctx.userId, "proposal_generated", {
    project_id: pass.projectId,
    trigger: pass.trigger,
    extractor: pass.extractor,
    proposal_count: pass.created,
    source_count: pass.sourcesPassed,
    discarded_count: pass.discarded,
  });
}

/** Called after the transaction that made the Proposal a Decision committed, from either path. */
export function proposalAccepted(ctx: Ctx, proposal: ProposalRow, accepted: CreateDecisionInput) {
  return capture(ctx.userId, "proposal_accepted", {
    project_id: proposal.projectId,
    proposal_id: proposal.id,
    extractor: proposal.extractor,
    edited_before_accept: editedBeforeAccept(proposal, accepted),
  });
}

/** Called after the conditional update that rejected a still-pending Proposal returned a row. */
export function proposalRejected(ctx: Ctx, proposal: ProposalRow) {
  return capture(ctx.userId, "proposal_rejected", {
    project_id: proposal.projectId,
    proposal_id: proposal.id,
    extractor: proposal.extractor,
  });
}

import { createHash } from "node:crypto";
import { assumptionFieldErrors } from "@/server/modules/decisions/validation";
import { SOURCE_EXCERPT_MAX, type AssumptionTargetType } from "@/shared/domain";
import type { ExtractSource, RawAssumption, RawProposal } from "./extract";
import type { NewProposalRow, ProposedAssumption, ProposedSource } from "./schema";

/**
 * Traceability filter (issue #39): an extractor claim survives only when every cited Source
 * exists in the Project and its excerpt is a verbatim substring of that Source's text.
 * Pure; the pass loads the rows.
 */

export interface TraceRefs {
  people: Array<{ id: string; name: string }>;
  milestones: Array<{ id: string; name: string }>;
  tasks: Array<{ id: string; title: string }>;
}

const LIMITS = { title: 200, chosen: 4000, context: 4000, alternatives: 4000, revisitWhen: 500 } as const;
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const cap = (v: string | null | undefined, max: number) => {
  const t = v?.trim();
  return t ? (t.length > max ? t.slice(0, max) : t) : null;
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const fingerprintOf = (primary: ProposedSource, title: string) =>
  createHash("sha1")
    .update(`${primary.kind}:${primary.entityId}|${norm(primary.excerpt)}|${norm(title)}`)
    .digest("hex");

export function traceSources(raw: RawProposal["sources"], sources: ExtractSource[]): ProposedSource[] | null {
  const out: ProposedSource[] = [];
  for (const s of raw) {
    const src = sources.find((x) => x.kind === s.kind && x.entityId === s.entityId);
    const excerpt = s.excerpt.replace(/\s+/g, " ").trim();
    if (!src || !excerpt || !norm(src.text).includes(norm(excerpt))) return null;
    out.push({ kind: s.kind, entityId: s.entityId, excerpt: excerpt.slice(0, SOURCE_EXCERPT_MAX) });
  }
  return out.length ? out : null;
}

const byName = <T extends { id: string }>(rows: T[], name: string | null | undefined, key: (r: T) => string) => {
  if (!name) return undefined;
  const n = norm(name);
  return rows.find((r) => norm(key(r)) === n) ?? rows.find((r) => norm(key(r)).includes(n) || n.includes(norm(key(r))));
};

/** Resolve a proposed Assumption's target by name; null when it cannot be made valid. */
export function traceAssumption(raw: RawAssumption, refs: TraceRefs): ProposedAssumption | null {
  const statement = cap(raw.statement, 500);
  if (!statement) return null;
  let targetType: AssumptionTargetType | null = null;
  let targetId: string | null = null;
  let targetName: string | null = null;
  if (raw.subtype === "person") {
    const p = byName(refs.people, raw.targetName, (r) => r.name);
    if (!p) return null;
    [targetType, targetId, targetName] = ["person", p.id, p.name];
  } else if (raw.subtype === "date") {
    const m = byName(refs.milestones, raw.targetName, (r) => r.name);
    const t = m ? undefined : byName(refs.tasks, raw.targetName, (r) => r.title);
    if (m) [targetType, targetId, targetName] = ["milestone", m.id, m.name];
    else if (t) [targetType, targetId, targetName] = ["task", t.id, t.title];
    else return null;
  } else if (raw.subtype === "dependency") {
    return null;
  }
  const assumedUntil =
    raw.subtype === "date" && raw.assumedUntil && ISO_DATE.test(raw.assumedUntil) ? raw.assumedUntil : null;
  const targetField =
    raw.subtype === "date" ? (targetType === "milestone" ? "dueDate" : (raw.targetField ?? "dueDate")) : null;
  const candidate: ProposedAssumption = {
    statement,
    subtype: raw.subtype,
    targetType,
    targetId,
    targetName,
    targetField,
    assumedUntil,
  };
  const errors = assumptionFieldErrors({ projectId: "", decisionId: "", ...candidate });
  return Object.keys(errors).length ? null : candidate;
}

export interface TracedProposal extends Omit<NewProposalRow, "projectId" | "extractor" | "assumptions"> {
  fingerprint: string;
  sources: ProposedSource[];
  assumptions: ProposedAssumption[];
}

/** Keep the traceable Proposals, drop the rest; Assumptions that do not resolve are dropped individually. */
export function traceProposals(raw: RawProposal[], sources: ExtractSource[], refs: TraceRefs) {
  const kept: TracedProposal[] = [];
  let discarded = 0;
  const seen = new Set<string>();
  for (const p of raw) {
    const title = cap(p.title, LIMITS.title);
    const chosen = cap(p.chosen, LIMITS.chosen);
    const traced = traceSources(p.sources, sources);
    if (!title || !chosen || !traced) {
      discarded++;
      continue;
    }
    const fingerprint = fingerprintOf(traced[0]!, title);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    kept.push({
      fingerprint,
      title,
      chosen,
      decidedOn: p.decidedOn && ISO_DATE.test(p.decidedOn) ? p.decidedOn : null,
      context: cap(p.context, LIMITS.context),
      alternatives: cap(p.alternatives, LIMITS.alternatives),
      revisitWhen: cap(p.revisitWhen, LIMITS.revisitWhen),
      sources: traced,
      assumptions: p.assumptions
        .map((a) => traceAssumption(a, refs))
        .filter((a): a is ProposedAssumption => Boolean(a)),
    });
  }
  return { kept, discarded };
}

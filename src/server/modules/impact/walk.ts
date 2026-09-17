import type { Edge } from "@/server/modules/dependencies/graph";
import type { AssumptionSubtype, ConsequenceType, DecisionEdgeKind } from "@/shared/domain";

/**
 * Pure impact walk (issue #38, ADR 0008). From one Assumption: `supports` edges to its
 * Decisions, `leads_to` edges to items, plus the watched item itself, then Dependency
 * successors breadth-first. Bounded by `maxDepth` (counted from the Decisions) and cycle-safe.
 * Risks are terminal: Dependencies only connect Tasks and Milestones.
 */

export interface WalkEdge {
  kind: DecisionEdgeKind;
  fromId: string;
  toType: string;
  toId: string;
}

export interface WalkItem {
  type: ConsequenceType;
  id: string;
  /** 0 = directly led to by a Decision or the watched item; +1 per Dependency hop. */
  depth: number;
}

export interface WalkInput {
  assumption: { id: string; subtype: AssumptionSubtype; targetType: string | null; targetId: string | null };
  edges: WalkEdge[];
  /** Dependency edges with their endpoint types, so hops know what they reach. */
  dependencies: Array<Edge & { successorType: "task" | "milestone" }>;
  /** For a dependency Assumption: the successor of the watched Dependency, if it still exists. */
  watchedDependency?: { successorType: "task" | "milestone"; successorId: string } | null;
  maxDepth?: number;
}

export const IMPACT_MAX_DEPTH = 3;

export function impactWalk({
  assumption,
  edges,
  dependencies,
  watchedDependency,
  maxDepth = IMPACT_MAX_DEPTH,
}: WalkInput) {
  const decisionIds = edges.filter((e) => e.kind === "supports" && e.fromId === assumption.id).map((e) => e.toId);
  const seen = new Map<string, WalkItem>();
  const queue: WalkItem[] = [];
  const add = (type: ConsequenceType, id: string, depth: number) => {
    const key = `${type}:${id}`;
    if (seen.has(key)) return;
    const item = { type, id, depth };
    seen.set(key, item);
    if (type !== "risk") queue.push(item);
  };

  for (const d of decisionIds) {
    for (const e of edges) {
      if (e.kind === "leads_to" && e.fromId === d && isConsequence(e.toType)) add(e.toType, e.toId, 0);
    }
  }
  if ((assumption.targetType === "task" || assumption.targetType === "milestone") && assumption.targetId) {
    add(assumption.targetType, assumption.targetId, 0);
  }
  if (assumption.subtype === "dependency" && watchedDependency) {
    add(watchedDependency.successorType, watchedDependency.successorId, 0);
  }

  const next = new Map<string, Array<{ type: "task" | "milestone"; id: string }>>();
  for (const dep of dependencies) {
    next.set(dep.predecessorId, [
      ...(next.get(dep.predecessorId) ?? []),
      { type: dep.successorType, id: dep.successorId },
    ]);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.depth >= maxDepth) continue;
    for (const s of next.get(cur.id) ?? []) add(s.type, s.id, cur.depth + 1);
  }

  return { decisionIds, items: [...seen.values()] };
}

const isConsequence = (t: string): t is ConsequenceType => t === "task" || t === "milestone" || t === "risk";

import type { AssumptionState, AssumptionSubtype, DecisionEdgeKind } from "@/shared/domain";

/**
 * Pure node-centred neighbourhood (issue #41, ADR 0008). One bounded, cycle-safe BFS backwards
 * over incoming edges (causes) and one forwards over outgoing edges (consequences), then a
 * fixpoint over the cause side that marks every node and edge a broken Assumption reaches the
 * centre through. No I/O: the service loads rows and describes the nodes afterwards.
 */

export const GRAPH_NODE_TYPES = ["decision", "assumption", "task", "milestone", "risk"] as const;
export type GraphNodeType = (typeof GRAPH_NODE_TYPES)[number];

export interface GraphNodeRef {
  type: GraphNodeType;
  id: string;
}

/** Stored edge kinds plus the two relations the graph derives: an Assumption watching an item, a Dependency. */
export type GraphEdgeKind = DecisionEdgeKind | "watches" | "depends_on";

export interface GraphEdge {
  /** Stable per relation: the `decision_edges` id, `watch:<assumptionId>` or `dep:<dependencyId>`. */
  key: string;
  kind: GraphEdgeKind;
  from: GraphNodeRef;
  to: GraphNodeRef;
  /** The `decision_edges` row, when the edge is stored and can carry Sources. */
  edgeId: string | null;
  /** True when a broken Assumption reaches the centre through this edge. */
  highlighted: boolean;
}

export interface GraphNode extends GraphNodeRef {
  /** Hops from the centre, 1..maxDepth. */
  depth: number;
  /** True when this node lies on a path from a broken Assumption to the centre. */
  onBrokenPath: boolean;
}

export interface NeighbourhoodInput {
  centre: GraphNodeRef;
  edges: Array<{ id: string; kind: DecisionEdgeKind; fromType: string; fromId: string; toType: string; toId: string }>;
  assumptions: Array<{
    id: string;
    state: AssumptionState;
    subtype: AssumptionSubtype;
    targetType: string | null;
    targetId: string | null;
  }>;
  dependencies: Array<{
    id: string;
    predecessorType: "task" | "milestone";
    predecessorId: string;
    successorType: "task" | "milestone";
    successorId: string;
  }>;
  /** Keys (`type:id`) of the nodes that exist; edges to anything else are dropped. */
  known: Iterable<string>;
  maxDepth?: number;
}

export interface Neighbourhood {
  causes: GraphNode[];
  consequences: GraphNode[];
  causeEdges: GraphEdge[];
  consequenceEdges: GraphEdge[];
  /** True when at least one highlighted edge ends at the centre. */
  brokenReachesCentre: boolean;
}

export const GRAPH_MAX_DEPTH = 3;

export const nodeKey = (n: GraphNodeRef) => `${n.type}:${n.id}`;

const isNodeType = (t: string): t is GraphNodeType => (GRAPH_NODE_TYPES as readonly string[]).includes(t);

export function neighbourhood({
  centre,
  edges,
  assumptions,
  dependencies,
  known,
  maxDepth = GRAPH_MAX_DEPTH,
}: NeighbourhoodInput): Neighbourhood {
  const exists = new Set(known);
  const ref = (type: string, id: string): GraphNodeRef | null =>
    isNodeType(type) && exists.has(`${type}:${id}`) ? { type, id } : null;
  const all: Omit<GraphEdge, "highlighted">[] = [];
  const push = (
    key: string,
    kind: GraphEdgeKind,
    from: GraphNodeRef | null,
    to: GraphNodeRef | null,
    edgeId: string | null,
  ) => {
    if (from && to) all.push({ key, kind, from, to, edgeId });
  };
  for (const e of edges) push(e.id, e.kind, ref(e.fromType, e.fromId), ref(e.toType, e.toId), e.id);
  for (const a of assumptions) {
    const from = ref("assumption", a.id);
    if (a.subtype === "dependency") {
      const dep = dependencies.find((d) => d.id === a.targetId);
      if (dep) push(`watch:${a.id}`, "watches", from, ref(dep.successorType, dep.successorId), null);
    } else if (a.targetType && a.targetId) {
      push(`watch:${a.id}`, "watches", from, ref(a.targetType, a.targetId), null);
    }
  }
  for (const d of dependencies) {
    push(
      `dep:${d.id}`,
      "depends_on",
      ref(d.predecessorType, d.predecessorId),
      ref(d.successorType, d.successorId),
      null,
    );
  }

  const centreKey = nodeKey(centre);
  const walk = (direction: "in" | "out") => {
    const next = new Map<string, Omit<GraphEdge, "highlighted">[]>();
    for (const e of all) {
      const k = nodeKey(direction === "in" ? e.to : e.from);
      next.set(k, [...(next.get(k) ?? []), e]);
    }
    const found = new Map<string, GraphNode>();
    const queue: Array<{ ref: GraphNodeRef; depth: number }> = [{ ref: centre, depth: 0 }];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.depth >= maxDepth) continue;
      for (const e of next.get(nodeKey(cur.ref)) ?? []) {
        const n = direction === "in" ? e.from : e.to;
        const k = nodeKey(n);
        if (k === centreKey || found.has(k)) continue;
        found.set(k, { ...n, depth: cur.depth + 1, onBrokenPath: false });
        queue.push({ ref: n, depth: cur.depth + 1 });
      }
    }
    const inside = (n: GraphNodeRef) => found.has(nodeKey(n)) || nodeKey(n) === centreKey;
    const kept = all.filter((e) =>
      direction === "in" ? found.has(nodeKey(e.from)) && inside(e.to) : inside(e.from) && found.has(nodeKey(e.to)),
    );
    return { nodes: found, edges: kept };
  };

  const causes = walk("in");
  const consequences = walk("out");

  // Fixpoint: a cause node is on a broken path if it is a broken Assumption or an on-path node points at it.
  const broken = new Set(assumptions.filter((a) => a.state === "broken").map((a) => `assumption:${a.id}`));
  for (const n of causes.nodes.values()) n.onBrokenPath = broken.has(nodeKey(n));
  for (let pass = 0; pass < maxDepth; pass++) {
    for (const e of causes.edges) {
      const to = causes.nodes.get(nodeKey(e.to));
      if (to && causes.nodes.get(nodeKey(e.from))?.onBrokenPath) to.onBrokenPath = true;
    }
  }
  const causeEdges = causes.edges.map((e) => ({
    ...e,
    highlighted: causes.nodes.get(nodeKey(e.from))?.onBrokenPath ?? false,
  }));

  const byDepth = (a: GraphNode, b: GraphNode) => a.depth - b.depth;
  return {
    causes: [...causes.nodes.values()].sort(byDepth),
    consequences: [...consequences.nodes.values()].sort(byDepth),
    causeEdges,
    consequenceEdges: consequences.edges.map((e) => ({ ...e, highlighted: false })),
    brokenReachesCentre: causeEdges.some((e) => e.highlighted && nodeKey(e.to) === centreKey),
  };
}

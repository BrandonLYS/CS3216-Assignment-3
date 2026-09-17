import { describe, expect, it } from "vitest";
import { impactWalk, type WalkEdge } from "./walk";

const supports = (a: string, d: string): WalkEdge => ({ kind: "supports", fromId: a, toType: "decision", toId: d });
const leadsTo = (d: string, toType: string, toId: string): WalkEdge => ({ kind: "leads_to", fromId: d, toType, toId });
const dep = (p: string, s: string, successorType: "task" | "milestone" = "task") => ({
  predecessorId: p,
  successorId: s,
  successorType,
});
const dateAssumption = { id: "a1", subtype: "date" as const, targetType: "milestone", targetId: "m1" };

describe("impactWalk", () => {
  it("collects Decisions, led-to items, the watched item and Dependency successors", () => {
    const r = impactWalk({
      assumption: dateAssumption,
      edges: [
        supports("a1", "d1"),
        supports("a1", "d2"),
        supports("a9", "d3"),
        leadsTo("d1", "task", "t1"),
        leadsTo("d2", "risk", "r1"),
      ],
      dependencies: [dep("t1", "t2"), dep("m1", "t3"), dep("r1", "t9")],
    });
    expect(r.decisionIds).toEqual(["d1", "d2"]);
    expect(r.items).toEqual([
      { type: "task", id: "t1", depth: 0 },
      { type: "risk", id: "r1", depth: 0 },
      { type: "milestone", id: "m1", depth: 0 },
      { type: "task", id: "t2", depth: 1 },
      { type: "task", id: "t3", depth: 1 },
    ]);
  });

  it("is bounded by maxDepth", () => {
    const chain = [dep("m1", "t1"), dep("t1", "t2"), dep("t2", "t3"), dep("t3", "t4"), dep("t4", "t5")];
    const ids = (max?: number) =>
      impactWalk({ assumption: dateAssumption, edges: [], dependencies: chain, maxDepth: max }).items.map((i) => i.id);
    expect(ids()).toEqual(["m1", "t1", "t2", "t3"]);
    expect(ids(1)).toEqual(["m1", "t1"]);
  });

  it("terminates on cycles and dedupes", () => {
    const r = impactWalk({
      assumption: dateAssumption,
      edges: [supports("a1", "d1"), leadsTo("d1", "task", "t1")],
      dependencies: [dep("t1", "t2"), dep("t2", "t1"), dep("m1", "t1")],
      maxDepth: 50,
    });
    expect(r.items.map((i) => `${i.id}@${i.depth}`)).toEqual(["t1@0", "m1@0", "t2@1"]);
  });

  it("uses the successor of a watched Dependency and returns nothing for an unsupported Assumption", () => {
    const r = impactWalk({
      assumption: { id: "a2", subtype: "dependency", targetType: "dependency", targetId: "dep1" },
      edges: [],
      dependencies: [dep("t1", "t2")],
      watchedDependency: { successorType: "task", successorId: "t1" },
    });
    expect(r.decisionIds).toEqual([]);
    expect(r.items.map((i) => i.id)).toEqual(["t1", "t2"]);
    expect(
      impactWalk({
        assumption: { id: "x", subtype: "external_rule", targetType: null, targetId: null },
        edges: [],
        dependencies: [],
      }),
    ).toEqual({ decisionIds: [], items: [] });
  });
});

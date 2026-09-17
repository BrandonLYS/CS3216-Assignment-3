import { describe, expect, it } from "vitest";
import { neighbourhood, type NeighbourhoodInput } from "./neighbourhood";

type E = NeighbourhoodInput["edges"][number];
const supports = (a: string, d: string): E => ({
  id: `s-${a}-${d}`,
  kind: "supports",
  fromType: "assumption",
  fromId: a,
  toType: "decision",
  toId: d,
});
const leadsTo = (d: string, toType: string, toId: string): E => ({
  id: `l-${d}-${toId}`,
  kind: "leads_to",
  fromType: "decision",
  fromId: d,
  toType,
  toId,
});
const superseded = (older: string, newer: string): E => ({
  id: `x-${older}-${newer}`,
  kind: "superseded_by",
  fromType: "decision",
  fromId: older,
  toType: "decision",
  toId: newer,
});
const dep = (p: string, s: string, successorType: "task" | "milestone" = "task") => ({
  id: `${p}-${s}`,
  predecessorType: "task" as const,
  predecessorId: p,
  successorType,
  successorId: s,
});
const assumption = (
  id: string,
  over: Partial<NeighbourhoodInput["assumptions"][number]> = {},
): NeighbourhoodInput["assumptions"][number] => ({
  id,
  state: "holding",
  subtype: "date",
  targetType: null,
  targetId: null,
  ...over,
});
const known = (...keys: string[]) => keys;
const ids = (nodes: Array<{ type: string; id: string; depth: number }>) => nodes.map((n) => `${n.id}@${n.depth}`);

describe("neighbourhood", () => {
  const base: Omit<NeighbourhoodInput, "centre"> = {
    edges: [
      supports("a1", "d1"),
      supports("a2", "d1"),
      leadsTo("d1", "task", "t1"),
      leadsTo("d1", "risk", "r1"),
      superseded("d1", "d2"),
    ],
    assumptions: [
      assumption("a1", { targetType: "milestone", targetId: "m1" }),
      assumption("a2", { subtype: "external_rule" }),
    ],
    dependencies: [dep("t1", "t2"), dep("r1", "t9")],
    known: known(
      "assumption:a1",
      "assumption:a2",
      "decision:d1",
      "decision:d2",
      "task:t1",
      "task:t2",
      "task:t9",
      "risk:r1",
      "milestone:m1",
    ),
  };

  it("centred on a Decision: Assumptions are causes; led-to items, successors and the superseding Decision are consequences", () => {
    const r = neighbourhood({ ...base, centre: { type: "decision", id: "d1" } });
    expect(ids(r.causes)).toEqual(["a1@1", "a2@1"]);
    expect(ids(r.consequences)).toEqual(["t1@1", "r1@1", "d2@1", "t2@2"]);
    expect(r.causeEdges.map((e) => e.kind)).toEqual(["supports", "supports"]);
    expect(r.consequenceEdges.map((e) => `${e.kind}:${e.from.id}>${e.to.id}`)).toEqual([
      "leads_to:d1>t1",
      "leads_to:d1>r1",
      "superseded_by:d1>d2",
      "depends_on:t1>t2",
    ]);
    // A Risk is a leaf: dependencies never connect Risks, so r1 -> t9 was dropped as unknown-typed.
    expect(r.consequences.some((n) => n.id === "t9")).toBe(false);
    expect(r.brokenReachesCentre).toBe(false);
  });

  it("centred on an Assumption: nothing leads here; the watched item and the Decision's downstream follow", () => {
    const r = neighbourhood({ ...base, centre: { type: "assumption", id: "a1" } });
    expect(r.causes).toEqual([]);
    expect(r.causeEdges).toEqual([]);
    expect(ids(r.consequences)).toEqual(["d1@1", "m1@1", "t1@2", "r1@2", "d2@2", "t2@3"]);
    expect(r.consequenceEdges.find((e) => e.kind === "watches")).toMatchObject({
      key: "watch:a1",
      from: { type: "assumption", id: "a1" },
      to: { type: "milestone", id: "m1" },
      edgeId: null,
    });
  });

  it("is bounded by maxDepth and terminates on a Dependency cycle", () => {
    const chain = [dep("t1", "t2"), dep("t2", "t3"), dep("t3", "t4"), dep("t4", "t5"), dep("t5", "t1")];
    const r = neighbourhood({
      centre: { type: "task", id: "t1" },
      edges: [],
      assumptions: [],
      dependencies: chain,
      known: known("task:t1", "task:t2", "task:t3", "task:t4", "task:t5"),
    });
    expect(ids(r.consequences)).toEqual(["t2@1", "t3@2", "t4@3"]);
    expect(ids(r.causes)).toEqual(["t5@1", "t4@2", "t3@3"]);
    // t4 and t3 sit on both sides; each side keeps only edges between its own nodes and the centre.
    expect(r.consequenceEdges.map((e) => e.key)).toEqual(["dep:t1-t2", "dep:t2-t3", "dep:t3-t4"]);
    expect(r.causeEdges.map((e) => e.key)).toEqual(["dep:t3-t4", "dep:t4-t5", "dep:t5-t1"]);
  });

  it("highlights every node and edge from a broken Assumption to the centre, and nothing from a holding one", () => {
    const r = neighbourhood({
      ...base,
      assumptions: [
        assumption("a1", { state: "broken", targetType: "milestone", targetId: "m1" }),
        assumption("a2", { subtype: "external_rule" }),
      ],
      centre: { type: "task", id: "t2" },
    });
    expect(ids(r.causes)).toEqual(["t1@1", "d1@2", "a1@3", "a2@3"]);
    const flags = Object.fromEntries(r.causes.map((n) => [n.id, n.onBrokenPath]));
    expect(flags).toEqual({ a1: true, a2: false, d1: true, t1: true });
    expect(r.causeEdges.filter((e) => e.highlighted).map((e) => e.key)).toEqual(["s-a1-d1", "l-d1-t1", "dep:t1-t2"]);
    expect(r.brokenReachesCentre).toBe(true);
  });

  it("does not highlight a broken Assumption on the consequence side", () => {
    const r = neighbourhood({
      ...base,
      assumptions: [assumption("a1", { state: "broken", targetType: "milestone", targetId: "m1" })],
      centre: { type: "decision", id: "d1" },
    });
    expect(r.consequenceEdges.every((e) => !e.highlighted)).toBe(true);
    expect(r.causes.find((n) => n.id === "a1")?.onBrokenPath).toBe(true);
    expect(r.brokenReachesCentre).toBe(true);
  });

  it("drops dangling edges and uses the successor of a watched Dependency", () => {
    const r = neighbourhood({
      centre: { type: "assumption", id: "a3" },
      edges: [supports("a3", "gone"), leadsTo("gone", "task", "t1")],
      assumptions: [assumption("a3", { subtype: "dependency", targetType: "dependency", targetId: "t1-t2" })],
      dependencies: [dep("t1", "t2")],
      known: known("assumption:a3", "task:t1", "task:t2"),
    });
    expect(ids(r.consequences)).toEqual(["t2@1"]);
    expect(r.consequenceEdges).toEqual([
      {
        key: "watch:a3",
        kind: "watches",
        from: { type: "assumption", id: "a3" },
        to: { type: "task", id: "t2" },
        edgeId: null,
        highlighted: false,
      },
    ]);
  });
});

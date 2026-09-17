import { describe, expect, it } from "vitest";
import type { RawProposal } from "./extract";
import { fingerprintOf, traceAssumption, traceProposals } from "./trace";

const sources = [
  { kind: "evidence" as const, entityId: "e1", title: "Notes", text: "We   decided to\nswitch to interviews. Done." },
  { kind: "comment" as const, entityId: "c1", title: "Comment", text: "Priya said the survey rate was 4%." },
];
const refs = {
  people: [{ id: "p1", name: "Priya Nair" }],
  milestones: [{ id: "m1", name: "UAT begins" }],
  tasks: [{ id: "t1", title: "Recruit interviewees" }],
};
const raw = (over: Partial<RawProposal> = {}): RawProposal => ({
  title: "Switch to interviews",
  chosen: "Interviews",
  sources: [{ kind: "evidence", entityId: "e1", excerpt: "decided to switch to interviews" }],
  assumptions: [],
  ...over,
});

describe("traceProposals", () => {
  it("keeps a Proposal whose excerpt is in the Source (whitespace and case tolerant)", () => {
    const { kept, discarded } = traceProposals(
      [raw({ sources: [{ kind: "evidence", entityId: "e1", excerpt: "WE DECIDED TO SWITCH" }] })],
      sources,
      refs,
    );
    expect(kept).toHaveLength(1);
    expect(discarded).toBe(0);
    expect(kept[0]!.sources[0]!.excerpt).toBe("WE DECIDED TO SWITCH");
  });

  it("discards unknown Sources, fabricated excerpts and empty titles", () => {
    const { kept, discarded } = traceProposals(
      [
        raw({ sources: [{ kind: "evidence", entityId: "nope", excerpt: "decided" }] }),
        raw({ sources: [{ kind: "evidence", entityId: "e1", excerpt: "we chose surveys" }] }),
        raw({ title: "  " }),
        raw({ sources: [] }),
        raw({ sources: [{ kind: "comment", entityId: "c1", excerpt: "survey rate was 4%" }] }),
      ],
      sources,
      refs,
    );
    expect(kept).toHaveLength(1);
    expect(discarded).toBe(4);
  });

  it("drops an Assumption that does not resolve but keeps the Proposal; fingerprints are stable and dedupe", () => {
    const p = raw({
      assumptions: [
        { statement: "Priya stays", subtype: "person", targetName: "priya nair" },
        { statement: "Ghost", subtype: "person", targetName: "Nobody" },
        { statement: "Data before UAT", subtype: "date", targetName: "UAT begins", assumedUntil: "2026-10-01" },
        { statement: "No date", subtype: "date", targetName: "UAT begins" },
        { statement: "Rule", subtype: "external_rule" },
      ],
    });
    const { kept } = traceProposals([p, p], sources, refs);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.assumptions.map((a) => a.statement)).toEqual(["Priya stays", "Data before UAT", "Rule"]);
    expect(kept[0]!.assumptions[1]).toMatchObject({ targetType: "milestone", targetId: "m1", targetField: "dueDate" });
    expect(fingerprintOf(kept[0]!.sources[0]!)).toBe(kept[0]!.fingerprint);
    expect(traceProposals([raw({ title: "Another title" })], sources, refs).kept[0]!.fingerprint).toBe(
      kept[0]!.fingerprint,
    );
  });

  it("caps long fields and validates dates", () => {
    const { kept } = traceProposals([raw({ title: "x".repeat(300), decidedOn: "yesterday" })], sources, refs);
    expect(kept[0]?.title).toHaveLength(200);
    expect(kept[0]?.decidedOn).toBeNull();
    expect(traceAssumption({ statement: "", subtype: "external_rule" }, refs)).toBeNull();
    expect(traceAssumption({ statement: "dep", subtype: "dependency" }, refs)).toBeNull();
    const two = {
      ...refs,
      people: [
        { id: "p1", name: "John Smith" },
        { id: "p2", name: "John Doe" },
      ],
    };
    expect(traceAssumption({ statement: "j", subtype: "person", targetName: "John" }, two)).toBeNull();
    expect(traceAssumption({ statement: "j", subtype: "person", targetName: "Doe" }, two)?.targetId).toBe("p2");
  });
});

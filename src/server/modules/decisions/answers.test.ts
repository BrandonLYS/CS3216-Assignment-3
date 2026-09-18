import { describe, expect, it } from "vitest";
import { citation, rankDecisions, rankEvidence, queryTerms, sourceHref } from "./answers";

const d = (
  over: Partial<{
    title: string;
    chosen: string;
    context: string | null;
    alternatives: string | null;
    decidedOn: string;
  }>,
  statements: string[] = [],
) => ({
  decision: {
    title: "",
    chosen: "",
    context: null,
    alternatives: null,
    revisitWhen: null,
    decidedOn: "2026-09-01",
    ...over,
  },
  assumptions: statements.map((statement) => ({ statement })),
});

describe("queryTerms", () => {
  it("drops stop words, punctuation and single characters, and dedupes", () => {
    expect(queryTerms("Why did we switch from surveys to interviews?")).toEqual(["switch", "surveys", "interviews"]);
    expect(queryTerms("a b interviews interviews")).toEqual(["interviews"]);
    expect(queryTerms("why did we")).toEqual([]);
  });
});

describe("rankDecisions", () => {
  it("weights title over chosen over context, breaks ties by date, and drops zero scores", () => {
    const inTitle = d({ title: "Switch to interviews", decidedOn: "2026-08-01" });
    const inChosen = d({ title: "Recruitment", chosen: "interviews only", decidedOn: "2026-09-01" });
    const inContext = d({ title: "Budget", context: "interviews are cheap", decidedOn: "2026-09-02" });
    const unrelated = d({ title: "Vendor", chosen: "Acme" });
    const tieOld = d({ title: "x", context: "interviews", decidedOn: "2026-01-01" });
    expect(rankDecisions([unrelated, tieOld, inContext, inChosen, inTitle], ["interviews"])).toEqual([
      inTitle,
      inChosen,
      inContext,
      tieOld,
    ]);
    expect(rankDecisions([inTitle], [])).toEqual([]);
  });

  it("counts Assumption statements", () => {
    const viaAssumption = d({ title: "Timeline" }, ["Dataset arrives before UAT"]);
    expect(rankDecisions([viaAssumption], ["dataset"])).toEqual([viaAssumption]);
  });
});

describe("rankEvidence", () => {
  it("ranks by title then text and caps the list", () => {
    const rows = [
      { id: "1", title: "Notes", body: "surveys", extractedText: null },
      { id: "2", title: "Survey results", body: null, extractedText: "x" },
      { id: "3", title: "Other", body: null, extractedText: null },
      { id: "4", title: "Surveys again", body: "surveys", extractedText: null },
      { id: "5", title: "Transcript", body: "agenda", extractedText: "the survey came back" },
    ];
    expect(rankEvidence(rows, ["survey", "surveys"], 3).map((e) => e.id)).toEqual(["4", "2", "1"]);
    expect(rankEvidence(rows, ["survey"], 5).map((e) => e.id)).toContain("5");
  });
});

describe("citation", () => {
  it("neutralises brackets and line breaks so the dock parser keeps the link", () => {
    expect(citation("Kickoff [draft]\nminutes", "/projects/p/evidence?item=e")).toBe(
      "[Kickoff (draft) minutes](/projects/p/evidence?item=e)",
    );
    expect(citation("  ", "/projects/p")).toBe("[source](/projects/p)");
  });
});

describe("sourceHref", () => {
  const lookups = {
    comments: new Map([["c1", { entityType: "task" as const, entityId: "t1" }]]),
    events: new Map([
      ["e1", { entityType: "milestone" as const, entityId: "m1" }],
      ["e2", { entityType: "person" as const, entityId: "p1" }],
      ["e3", { entityType: "evidence" as const, entityId: "ev1" }],
    ]),
  };
  it("links each kind to the place that shows it, with fallbacks", () => {
    expect(sourceHref("p", "d", { kind: "evidence", entityId: "ev1" }, lookups)).toBe(
      "/projects/p/evidence?item=ev1#evidence-ev1",
    );
    expect(sourceHref("p", "d", { kind: "evidence", entityId: "ev1", passageId: "pa1" }, lookups)).toBe(
      "/projects/p/evidence?item=ev1#passage-pa1",
    );
    expect(sourceHref("p", "d", { kind: "evidence", entityId: "ev1", passageId: null }, lookups)).toBe(
      "/projects/p/evidence?item=ev1#evidence-ev1",
    );
    expect(sourceHref("p", "d", { kind: "comment", entityId: "c1" }, lookups)).toBe(
      "/projects/p/tasks?task=t1&tab=history",
    );
    expect(sourceHref("p", "d", { kind: "comment", entityId: "gone" }, lookups)).toBe(
      "/projects/p/decisions?decision=d",
    );
    expect(sourceHref("p", "d", { kind: "activity_event", entityId: "e1" }, lookups)).toBe(
      "/projects/p/timeline?milestone=m1&tab=history",
    );
    expect(sourceHref("p", "d", { kind: "activity_event", entityId: "e3" }, lookups)).toBe(
      "/projects/p/evidence?item=ev1#evidence-ev1",
    );
    expect(sourceHref("p", "d", { kind: "activity_event", entityId: "e2" }, lookups)).toBe("/projects/p");
    expect(sourceHref("p", "d", { kind: "activity_event", entityId: "missing" }, lookups)).toBe("/projects/p");
  });
});

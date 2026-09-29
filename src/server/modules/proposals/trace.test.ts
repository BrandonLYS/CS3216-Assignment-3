import { describe, expect, it } from "vitest";
import type { RawProposal } from "./extract";
import type { RawItems, RawMilestone, RawTask } from "./extract-items";
import { attachPassages, fingerprintOf, traceAssumption, traceItems, traceProposals } from "./trace";

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
  decidedOn: null,
  context: null,
  chosen: "Interviews",
  alternatives: null,
  revisitWhen: null,
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
        {
          statement: "Priya stays",
          subtype: "person",
          targetName: "priya nair",
          targetField: null,
          assumedUntil: null,
        },
        { statement: "Ghost", subtype: "person", targetName: "Nobody", targetField: null, assumedUntil: null },
        {
          statement: "Data before UAT",
          subtype: "date",
          targetName: "UAT begins",
          targetField: null,
          assumedUntil: "2026-10-01",
        },
        { statement: "No date", subtype: "date", targetName: "UAT begins", targetField: null, assumedUntil: null },
        {
          statement: "Rule",
          subtype: "external_rule",
          targetName: null,
          targetField: null,
          assumedUntil: null,
        },
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
    expect(
      traceAssumption(
        { statement: "", subtype: "external_rule", targetName: null, targetField: null, assumedUntil: null },
        refs,
      ),
    ).toBeNull();
    expect(
      traceAssumption(
        { statement: "dep", subtype: "dependency", targetName: null, targetField: null, assumedUntil: null },
        refs,
      ),
    ).toBeNull();
    const two = {
      ...refs,
      people: [
        { id: "p1", name: "John Smith" },
        { id: "p2", name: "John Doe" },
      ],
    };
    expect(
      traceAssumption(
        { statement: "j", subtype: "person", targetName: "John", targetField: null, assumedUntil: null },
        two,
      ),
    ).toBeNull();
    expect(
      traceAssumption(
        { statement: "j", subtype: "person", targetName: "Doe", targetField: null, assumedUntil: null },
        two,
      )?.targetId,
    ).toBe("p2");
  });
});

describe("attachPassages", () => {
  const passages = new Map([
    [
      "e1",
      [
        { id: "p1", text: "The merchant dataset slipped again." },
        { id: "p2", text: "We decided to freeze scope\nafter the pilot instead of adding the export." },
      ],
    ],
  ]);
  const proposal = (excerpt: string, entityId = "e1", kind: "evidence" | "comment" = "evidence") => ({
    sources: [{ kind, entityId, excerpt }],
  });

  it("points an excerpt at the Passage that contains it, whitespace and case tolerant", () => {
    const [out] = attachPassages([proposal("we DECIDED to freeze scope after the pilot")], passages);
    expect(out!.sources[0]).toMatchObject({ passageId: "p2" });
  });

  it("gives null when the excerpt spans two Passages and leaves Sources without Passages untouched", () => {
    const [spanning, comment, other] = attachPassages(
      [proposal("slipped again. We decided"), proposal("anything", "c1", "comment"), proposal("anything", "e9")],
      passages,
    );
    expect(spanning!.sources[0]).toMatchObject({ passageId: null });
    expect(comment!.sources[0]).not.toHaveProperty("passageId");
    expect(other!.sources[0]).not.toHaveProperty("passageId");
  });
});

describe("traceItems", () => {
  const itemSources = [
    {
      kind: "evidence" as const,
      entityId: "e1",
      title: "Notes",
      text: "Action item: Priya to draft the interview guide by 2026-10-02.\n\nMilestone: Pilot readout on 2026-10-20.",
    },
  ];
  const task = (over: Partial<RawTask> = {}): RawTask => ({
    title: "Draft the interview guide",
    description: null,
    assigneeName: "Priya Nair",
    milestoneName: "UAT begins",
    startDate: null,
    dueDate: "2026-10-02",
    sources: [{ kind: "evidence", entityId: "e1", excerpt: "Priya to draft the interview guide by 2026-10-02." }],
    ...over,
  });
  const milestone = (over: Partial<RawMilestone> = {}): RawMilestone => ({
    name: "Pilot readout",
    description: null,
    dueDate: "2026-10-20",
    ownerName: null,
    sources: [{ kind: "evidence", entityId: "e1", excerpt: "Milestone: Pilot readout on 2026-10-20." }],
    ...over,
  });
  const run = (items: Partial<RawItems>, pending: Parameters<typeof traceItems>[3] = []) =>
    traceItems({ tasks: [], milestones: [], ...items }, itemSources, refs, pending);

  it("keeps a traceable Task and Milestone and resolves names to ids", () => {
    const { kept, discarded } = run({ tasks: [task()], milestones: [milestone({ ownerName: "priya nair" })] });
    expect(discarded).toBe(0);
    expect(kept.map((k) => [k.kind, k.fields])).toEqual([
      [
        "task",
        {
          title: "Draft the interview guide",
          description: null,
          assigneeId: "p1",
          assigneeName: "Priya Nair",
          milestoneId: "m1",
          milestoneName: "UAT begins",
          startDate: null,
          dueDate: "2026-10-02",
        },
      ],
      [
        "milestone",
        { name: "Pilot readout", description: null, dueDate: "2026-10-20", ownerId: "p1", ownerName: "Priya Nair" },
      ],
    ]);
    expect(kept[0]!.sources).toEqual([
      { kind: "evidence", entityId: "e1", excerpt: "Priya to draft the interview guide by 2026-10-02." },
    ]);
  });

  it("keeps an unresolved name as a snapshot with a null id", () => {
    const [kept] = run({ tasks: [task({ assigneeName: "Ghost", milestoneName: "Pilot readout" })] }).kept;
    expect(kept!.fields).toMatchObject({
      assigneeId: null,
      assigneeName: "Ghost",
      milestoneId: null,
      milestoneName: "Pilot readout",
    });
  });

  it("discards fabricated excerpts, unknown Sources and empty titles", () => {
    const { kept, discarded } = run({
      tasks: [
        task({ sources: [{ kind: "evidence", entityId: "e1", excerpt: "Marcus to book the room." }] }),
        task({ sources: [{ kind: "evidence", entityId: "nope", excerpt: "Action item" }] }),
        task({ title: "   " }),
      ],
    });
    expect(kept).toEqual([]);
    expect(discarded).toBe(3);
  });

  it("accepts ISO dates only and drops a start date after the due date", () => {
    const [a, b] = run({
      tasks: [
        task({ dueDate: "2 October", startDate: "2026-09-01" }),
        task({
          title: "Draft the consent form",
          startDate: "2026-10-05",
          sources: [{ kind: "evidence", entityId: "e1", excerpt: "Action item: Priya to draft" }],
        }),
      ],
    }).kept;
    expect(a!.fields).toMatchObject({ dueDate: null, startDate: "2026-09-01" });
    expect(b!.fields).toMatchObject({ dueDate: "2026-10-02", startDate: null });
  });

  it("discards a Milestone without a valid date", () => {
    const { kept, discarded } = run({ milestones: [milestone({ dueDate: null }), milestone({ dueDate: "soon" })] });
    expect(kept).toEqual([]);
    expect(discarded).toBe(2);
  });

  it("discards duplicates of existing items and pending item Proposals, but not a short title inside a longer one", () => {
    const { kept, discarded } = traceItems(
      {
        tasks: [
          task({ title: "Recruit interviewees!" }),
          task({ title: "Recruit", sources: [{ kind: "evidence", entityId: "e1", excerpt: "Action item" }] }),
          task({
            title: "Draft the interview guide for the pilot",
            sources: [{ kind: "evidence", entityId: "e1", excerpt: "draft the interview guide" }],
          }),
        ],
        milestones: [milestone({ name: "UAT begins" })],
      },
      itemSources,
      refs,
      [{ kind: "task", title: "Draft the interview guide" }],
    );
    expect(kept.map((k) => (k.fields as { title: string }).title)).toEqual(["Recruit"]);
    expect(discarded).toBe(3);
  });

  it("fingerprints by item kind and excerpt, stable across runs", () => {
    const shared = [{ kind: "evidence" as const, entityId: "e1", excerpt: "Pilot readout on 2026-10-20" }];
    const once = run({
      tasks: [task({ title: "Prepare the readout", sources: shared })],
      milestones: [milestone({ sources: shared })],
    }).kept;
    const twice = run({
      tasks: [task({ title: "Prepare the pilot readout deck", sources: shared })],
      milestones: [milestone({ sources: shared })],
    }).kept;
    expect(once[0]!.fingerprint).not.toBe(once[1]!.fingerprint);
    expect(twice.map((k) => k.fingerprint)).toEqual(once.map((k) => k.fingerprint));
  });

  it("keeps the first of two items citing the same excerpt or restating the same title", () => {
    expect(run({ tasks: [task(), task({ title: "Other wording" })] }).kept).toHaveLength(1);
    const sameTitle = run({
      tasks: [task(), task({ sources: [{ kind: "evidence", entityId: "e1", excerpt: "Action item: Priya" }] })],
    });
    expect(sameTitle.kept).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { ATTENTION_RULES, type ScaleLevel, type StatusCategory } from "@/shared/domain";
import { compareAttention, evaluateAttention, type AttentionInput, type AttentionItem } from "./attention";

const today = "2026-09-15";
const project = { id: "p1", key: "ACME" };

const status = (category: StatusCategory, name?: string) => ({ name: name ?? category, category });
const TODO = status("not_started", "Todo");
const BLOCKED = status("blocked", "Blocked");
const DONE = status("done", "Done");
const PLANNED = status("planned", "Planned");
const REACHED = status("reached", "Reached");
const OPEN = status("open", "Open");
const CLOSED = status("closed", "Closed");

let seq = 0;
const task = (
  id: string,
  o: { start?: string | null; due?: string | null; status?: typeof TODO; milestoneId?: string | null } = {},
): AttentionInput["tasks"][number] => ({
  task: {
    id,
    number: ++seq,
    title: `Task ${id}`,
    startDate: o.start ?? null,
    dueDate: o.due ?? null,
    milestoneId: o.milestoneId ?? null,
  },
  status: o.status ?? TODO,
});
const milestone = (
  id: string,
  due: string,
  st: { category: StatusCategory } = PLANNED,
): AttentionInput["milestones"][number] => ({ milestone: { id, name: `Milestone ${id}`, dueDate: due }, status: st });
const risk = (
  id: string,
  probability: ScaleLevel,
  impact: ScaleLevel,
  st: { category: StatusCategory } = OPEN,
  title = `Risk ${id}`,
): AttentionInput["risks"][number] => ({ risk: { id, number: ++seq, title, probability, impact }, status: st });
const edge = (
  predecessorType: "task" | "milestone",
  predecessorId: string,
  successorType: "task" | "milestone",
  successorId: string,
): AttentionInput["dependencies"][number] => ({ predecessorType, predecessorId, successorType, successorId });

const run = (partial: Partial<AttentionInput>) =>
  evaluateAttention({ today, project, tasks: [], milestones: [], risks: [], dependencies: [], ...partial });

const group = (r: ReturnType<typeof run>, rule: string) => r.groups.find((g) => g.rule === rule);
const allItems = (r: ReturnType<typeof run>) => r.groups.flatMap((g) => g.items);

describe("evaluateAttention", () => {
  it("lists an overdue task under task_overdue with a dated reason", () => {
    const r = run({ tasks: [task("a", { due: "2026-09-12" })] });
    expect(r.groups.map((g) => g.rule)).toEqual(["task_overdue"]);
    const item = group(r, "task_overdue")!.items[0]!;
    expect(item.reasons).toEqual(["Due 12 Sep, 3 days ago"]);
    expect(item.entityType).toBe("task");
    expect(item.entityId).toBe("a");
    expect(item.code).toBe("ACME-1");
    expect(item.href).toBe("/projects/p1/tasks?task=a");
    expect(item.date).toBe("2026-09-12");
    expect(r.counts.task_overdue).toBe(1);
  });

  it("lists a task due in 3 days but not one due in 10 days", () => {
    const r = run({ tasks: [task("soon", { due: "2026-09-18" }), task("later", { due: "2026-09-25" })] });
    expect(group(r, "task_due_soon")!.items.map((i) => i.entityId)).toEqual(["soon"]);
    expect(group(r, "task_due_soon")!.items[0]!.reasons).toEqual(["Due 18 Sep, in 3 days"]);
    expect(allItems(r).some((i) => i.entityId === "later")).toBe(false);
  });

  it("says 'Due today' for a task due today", () => {
    const r = run({ tasks: [task("t", { due: today })] });
    expect(group(r, "task_due_soon")!.items[0]!.reasons).toEqual(["Due today"]);
  });

  it("lists a blocked task under task_blocked", () => {
    const r = run({ tasks: [task("b", { status: BLOCKED })] });
    expect(r.groups.map((g) => g.rule)).toEqual(["task_blocked"]);
    expect(group(r, "task_blocked")!.items[0]!.reasons).toEqual(["Blocked (Blocked)"]);
  });

  it("excludes a done task with a past due date", () => {
    const r = run({ tasks: [task("d", { due: "2026-09-01", status: DONE })] });
    expect(r.groups).toEqual([]);
    expect(Object.values(r.counts).every((n) => n === 0)).toBe(true);
  });

  it("lists a past milestone with an open task, not one whose tasks are all done", () => {
    const r = run({
      milestones: [
        milestone("m1", "2026-09-10"),
        milestone("m2", "2026-09-11"),
        milestone("m3", "2026-09-01", REACHED),
      ],
      tasks: [
        task("t1", { milestoneId: "m1" }),
        task("t2", { milestoneId: "m2", status: DONE }),
        task("t3", { milestoneId: "m3" }),
      ],
    });
    const g = group(r, "milestone_past_open")!;
    expect(g.items.map((i) => i.entityId)).toEqual(["m1"]);
    expect(g.items[0]!.reasons).toEqual(["Milestone date 10 Sep passed, 1 open task"]);
    expect(g.items[0]!.href).toBe("/projects/p1/timeline?milestone=m1");
    expect(g.items[0]!.entityType).toBe("milestone");
  });

  it("lists a top-band open risk, not a closed top-band risk", () => {
    const r = run({
      risks: [
        risk("r1", "high", "high"),
        risk("r2", "high", "high", CLOSED),
        risk("r3", "high", "medium"),
        risk("r4", "medium", "medium"),
      ],
    });
    const g = group(r, "risk_top")!;
    // Top band starts at Medium x High (6), the same threshold the Risk Register colours red.
    expect(g.items.map((i) => i.entityId)).toEqual(["r1", "r3"]);
    expect(g.items[0]!.reasons).toEqual(["Severity 9 (High / High)"]);
    expect(g.items[1]!.reasons).toEqual(["Severity 6 (High / Medium)"]);
    expect(g.items[0]!.href).toBe("/projects/p1/risks?risk=r1");
    expect(g.items[0]!.code).toMatch(/^R-\d+$/);
  });

  it("flags a dependency whose upstream is due after the downstream start", () => {
    seq = 6;
    const up = task("up", { due: "2026-09-23" }); // ACME-7
    const down = task("down", { start: "2026-09-18", due: "2026-09-30" });
    const r = run({ tasks: [up, down], dependencies: [edge("task", "up", "task", "down")] });
    const g = group(r, "dependency_late")!;
    expect(g.items.map((i) => i.entityId)).toEqual(["down"]);
    expect(g.items[0]!.reasons).toEqual(["Depends on ACME-7, due 23 Sep, after start 18 Sep"]);
    expect(g.items[0]!.date).toBe("2026-09-18");
  });

  it("ignores a dependency whose upstream is done", () => {
    const r = run({
      tasks: [task("up", { due: "2026-09-23", status: DONE }), task("down", { start: "2026-09-18" })],
      dependencies: [edge("task", "up", "task", "down")],
    });
    expect(r.groups).toEqual([]);
  });

  it("falls back to the downstream due date when it has no start", () => {
    const r = run({
      tasks: [task("up", { due: "2026-09-23" }), task("down", { due: "2026-09-20" })],
      dependencies: [edge("task", "up", "task", "down")],
    });
    const item = group(r, "dependency_late")!.items[0]!;
    expect(item.reasons[0]).toMatch(/after due 20 Sep$/);
    // downstream due 20 Sep is also within the due-soon window: dedupe puts it under dependency_late
    expect(item.matched).toEqual(["dependency_late", "task_due_soon"]);
    expect(group(r, "task_due_soon")).toBeUndefined();
  });

  it("uses a milestone as upstream, skips task→milestone and milestone→milestone edges", () => {
    const r = run({
      milestones: [milestone("m1", "2026-09-25"), milestone("m2", "2026-09-01")],
      tasks: [task("t1", { start: "2026-09-20", due: "2026-09-30" }), task("t2", { start: "2026-09-20" })],
      dependencies: [
        edge("milestone", "m1", "task", "t1"),
        edge("task", "t2", "milestone", "m1"),
        edge("milestone", "m2", "milestone", "m1"),
      ],
    });
    const g = group(r, "dependency_late")!;
    expect(g.items.map((i) => i.entityId)).toEqual(["t1"]);
    expect(g.items[0]!.reasons).toEqual(["Depends on Milestone m1, due 25 Sep, after start 20 Sep"]);
    expect(allItems(r)).toHaveLength(1);
  });

  it("shows a task that is overdue and blocked once, under task_overdue, with two reasons", () => {
    const r = run({ tasks: [task("x", { due: "2026-09-12", status: BLOCKED })] });
    expect(r.groups.map((g) => g.rule)).toEqual(["task_overdue"]);
    const item = group(r, "task_overdue")!.items[0]!;
    expect(item.matched).toEqual(["task_overdue", "task_blocked"]);
    expect(item.reasons).toHaveLength(2);
    expect(item.reasons).toEqual(["Due 12 Sep, 3 days ago", "Blocked (Blocked)"]);
    expect(group(r, "task_blocked")).toBeUndefined();
    expect(r.counts.task_blocked).toBe(0);
    expect(r.counts.task_overdue).toBe(1);
  });

  it("orders groups by severity and items by urgency", () => {
    seq = 0;
    const r = run({
      tasks: [
        task("o2", { due: "2026-09-10" }),
        task("o1", { due: "2026-09-14" }),
        task("b-nodue", { status: BLOCKED }),
        task("b-due", { due: "2026-10-10", status: BLOCKED }),
        task("up1", { due: "2026-09-25" }),
        task("d-small", { start: "2026-09-24", due: "2026-10-20" }),
        task("up2", { due: "2026-10-05" }),
        task("d-big", { start: "2026-09-20", due: "2026-10-20" }),
        task("s2", { due: "2026-09-20" }),
        task("s1", { due: "2026-09-16" }),
        task("mt", { milestoneId: "m1" }),
      ],
      milestones: [milestone("m1", "2026-09-05")],
      risks: [risk("rb", "high", "high", OPEN, "Beta"), risk("ra", "high", "high", OPEN, "Alpha")],
      dependencies: [edge("task", "up1", "task", "d-small"), edge("task", "up2", "task", "d-big")],
    });
    expect(r.groups.map((g) => g.rule)).toEqual([...ATTENTION_RULES]);
    expect(group(r, "task_overdue")!.items.map((i) => i.entityId)).toEqual(["o2", "o1"]);
    expect(group(r, "dependency_late")!.items.map((i) => i.entityId)).toEqual(["d-big", "d-small"]);
    expect(group(r, "milestone_past_open")!.items.map((i) => i.entityId)).toEqual(["m1"]);
    expect(group(r, "task_blocked")!.items.map((i) => i.entityId)).toEqual(["b-due", "b-nodue"]);
    expect(group(r, "risk_top")!.items.map((i) => i.label)).toEqual(["Alpha", "Beta"]);
    expect(group(r, "task_due_soon")!.items.map((i) => i.entityId)).toEqual(["s1", "s2"]);
    expect(r.counts).toEqual({
      task_overdue: 2,
      dependency_late: 2,
      milestone_past_open: 1,
      task_blocked: 2,
      risk_top: 2,
      task_due_soon: 2,
    });
  });

  it("compareAttention sorts across projects by severity then urgency", () => {
    const mk = (rule: AttentionItem["rule"], urgency: number, code: string, projectId: string): AttentionItem => ({
      rule,
      matched: [rule],
      reasons: [],
      entityType: "task",
      entityId: code,
      label: code,
      code,
      href: "",
      urgency,
      projectId,
    });
    const items = [
      mk("task_due_soon", 1, "B-1", "b"),
      mk("task_blocked", 5, "A-9", "a"),
      mk("task_overdue", -1, "B-2", "b"),
      mk("task_overdue", -10, "A-1", "a"),
      mk("task_blocked", 5, "A-3", "a"),
    ];
    expect([...items].sort(compareAttention).map((i) => i.code)).toEqual(["A-1", "B-2", "A-3", "A-9", "B-1"]);
  });

  it("counts has every rule as a key even when empty", () => {
    const r = run({});
    expect(Object.keys(r.counts).sort()).toEqual([...ATTENTION_RULES].sort());
    expect(r.counts).toEqual({
      task_overdue: 0,
      dependency_late: 0,
      milestone_past_open: 0,
      task_blocked: 0,
      risk_top: 0,
      task_due_soon: 0,
    });
  });
});

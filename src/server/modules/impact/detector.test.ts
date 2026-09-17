import { describe, expect, it } from "vitest";
import { dateContradiction, dependencyContradiction, personContradiction } from "./detector";

const date = { targetField: "dueDate", assumedUntil: "2026-10-01" };

describe("dateContradiction", () => {
  it("breaks when the watched field moves past the assumed date", () => {
    const r = dateContradiction(
      date,
      { field: "dueDate", oldValue: "2026-09-25", newValue: "2026-10-20" },
      "UAT begins",
    );
    expect(r).toBe('"UAT begins" due date moved from 25 Sep 2026 to 20 Oct 2026, past the assumed 1 Oct 2026');
  });
  it("holds when the date stays on or before the assumed date, is cleared, or another field changes", () => {
    expect(
      dateContradiction(date, { field: "dueDate", oldValue: "2026-09-25", newValue: "2026-10-01" }, "m"),
    ).toBeNull();
    expect(dateContradiction(date, { field: "dueDate", oldValue: "2026-09-25", newValue: null }, "m")).toBeNull();
    expect(dateContradiction(date, { field: "name", oldValue: "a", newValue: "b" }, "m")).toBeNull();
    expect(dateContradiction(date, { field: "startDate", oldValue: null, newValue: "2026-12-01" }, "m")).toBeNull();
  });
  it("names the start date when that is the watched field and handles an unset old value", () => {
    const r = dateContradiction(
      { targetField: "startDate", assumedUntil: "2026-10-01" },
      { field: "startDate", oldValue: null, newValue: "2026-10-02" },
      "Recruit",
    );
    expect(r).toBe('"Recruit" start date moved from unset to 2 Oct 2026, past the assumed 1 Oct 2026');
  });
});

describe("personContradiction", () => {
  it("names the Person", () => {
    expect(personContradiction("Priya Nair")).toBe("Priya Nair was removed from the project");
  });
});

describe("dependencyContradiction", () => {
  const open = (over: Partial<Parameters<typeof dependencyContradiction>[0]>) => ({
    label: "X",
    category: "in_progress" as const,
    statusName: "In progress",
    dueDate: null,
    startDate: null,
    ...over,
  });
  it("blocks when the predecessor is due after the successor start", () => {
    const r = dependencyContradiction(
      open({ label: "Implement v2", dueDate: "2026-10-20" }),
      open({ label: "Load test", startDate: "2026-10-10", dueDate: "2026-10-30" }),
    );
    expect(r).toBe(
      '"Implement v2" -> "Load test" became blocking: Implement v2 due 20 Oct 2026 is after Load test start 10 Oct 2026',
    );
  });
  it("falls back to the successor due date and blocks on a blocked predecessor", () => {
    expect(
      dependencyContradiction(open({ dueDate: "2026-10-20" }), open({ label: "Y", dueDate: "2026-10-10" })),
    ).toContain("after Y due 10 Oct 2026");
    expect(
      dependencyContradiction(open({ category: "blocked", statusName: "Waiting on vendor" }), open({ label: "Y" })),
    ).toBe('"X" -> "Y" became blocking: X is blocked (Waiting on vendor)');
  });
  it("holds when the predecessor is done, on time, or dates are missing", () => {
    expect(
      dependencyContradiction(open({ category: "done", dueDate: "2026-12-01" }), open({ dueDate: "2026-10-01" })),
    ).toBeNull();
    expect(dependencyContradiction(open({ dueDate: "2026-10-01" }), open({ startDate: "2026-10-01" }))).toBeNull();
    expect(dependencyContradiction(open({}), open({ startDate: "2026-10-01" }))).toBeNull();
    expect(dependencyContradiction(open({ dueDate: "2026-10-05" }), open({}))).toBeNull();
  });
});

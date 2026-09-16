import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "@/server/modules/activity/enrich";
import { groupHistory } from "./entity-history";

const at = "2026-03-01T10:00:00.000Z";
const row = (over: Partial<HistoryEntry> & { id: string }): HistoryEntry => ({
  action: "updated",
  entityType: "task",
  field: null,
  fieldLabel: null,
  kind: null,
  oldValue: null,
  newValue: null,
  oldLabel: null,
  newLabel: null,
  actorId: "u1",
  actorName: "Ana",
  occurredAt: at,
  ...over,
});

describe("groupHistory", () => {
  it("puts the item's created row last within a same-second group, after fields and comments", () => {
    const entries: HistoryEntry[] = [
      row({ id: "created", action: "created" }),
      row({ id: "comment", entityType: "comment", action: "created", kind: "comment", newLabel: "hi" }),
      row({ id: "status", field: "statusId", kind: "status" }),
      row({ id: "title", field: "title", kind: "text" }),
    ];
    const groups = groupHistory(entries, "task");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["title", "status", "comment", "created"]);
  });

  it("splits groups by actor and by second, keeping newest-first order", () => {
    const entries: HistoryEntry[] = [
      row({ id: "a", field: "title", occurredAt: "2026-03-01T10:00:05.000Z" }),
      row({ id: "b", field: "title", occurredAt: "2026-03-01T10:00:05.400Z", actorId: "u2", actorName: "Bo" }),
      row({ id: "c", action: "created", occurredAt: "2026-03-01T10:00:04.000Z" }),
    ];
    const groups = groupHistory(entries, "task");
    expect(groups.map((g) => g.entries.map((e) => e.id))).toEqual([["a"], ["b"], ["c"]]);
    expect(groups.at(-1)!.entries.at(-1)!.action).toBe("created");
  });
});

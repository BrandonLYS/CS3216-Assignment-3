import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("marks added, removed and unchanged lines", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "x" },
      { kind: "same", text: "c" },
      { kind: "added", text: "d" },
    ]);
  });

  it("treats an empty previous version as all added", () => {
    expect(diffLines("", "one\ntwo")).toEqual([
      { kind: "added", text: "one" },
      { kind: "added", text: "two" },
    ]);
  });
});

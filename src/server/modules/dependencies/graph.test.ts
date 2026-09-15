import { describe, expect, it } from "vitest";
import { downstreamOf, wouldCreateCycle } from "./graph";

const edges = [
  { predecessorId: "api", successorId: "integration" },
  { predecessorId: "integration", successorId: "uat" },
  { predecessorId: "uat", successorId: "launch" },
];

describe("wouldCreateCycle", () => {
  it("rejects self-dependency", () => {
    expect(wouldCreateCycle(edges, "api", "api")).toBe(true);
  });
  it("detects a direct back-edge", () => {
    expect(wouldCreateCycle(edges, "integration", "api")).toBe(true);
  });
  it("detects a transitive back-edge", () => {
    expect(wouldCreateCycle(edges, "launch", "api")).toBe(true);
  });
  it("allows a forward or unrelated edge", () => {
    expect(wouldCreateCycle(edges, "api", "launch")).toBe(false);
    expect(wouldCreateCycle(edges, "design", "api")).toBe(false);
  });
});

describe("downstreamOf", () => {
  it("returns everything transitively after an item", () => {
    expect([...downstreamOf(edges, "api")].sort()).toEqual(["integration", "launch", "uat"]);
    expect(downstreamOf(edges, "launch").size).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { WHY_RULES, projectSystemPrompt, workspaceSystemPrompt } from "./prompt";

describe("projectSystemPrompt", () => {
  it("carries the citation rules for why-did-we answers", () => {
    const prompt = projectSystemPrompt({ project: { id: "p" } });
    for (const rule of WHY_RULES) expect(prompt).toContain(rule);
    expect(prompt).toContain("There is no recorded decision about that.");
    expect(prompt).toContain("supersededBy");
    expect(workspaceSystemPrompt([])).not.toContain("search_decisions");
  });
});

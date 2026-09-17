import { describe, expect, it } from "vitest";
import { internalHref, splitLinks } from "./linked-text";

describe("splitLinks", () => {
  it("turns internal Markdown links into link chunks and keeps the surrounding text", () => {
    expect(
      splitLinks("We switched because rates fell [Kickoff minutes](/projects/p/evidence?item=e1#evidence-e1)."),
    ).toEqual([
      { type: "text", text: "We switched because rates fell " },
      { type: "link", label: "Kickoff minutes", href: "/projects/p/evidence?item=e1#evidence-e1" },
      { type: "text", text: "." },
    ]);
  });

  it("leaves external, protocol-relative and javascript hrefs as literal text", () => {
    for (const href of [
      "https://evil.example",
      "//evil.example/x",
      "javascript:alert(1)",
      "mailto:a@b.c",
      "/login",
      "/api/auth/sign-out",
      "/projects/../login",
      "/projects/p/../../api/x",
    ]) {
      expect(splitLinks(`see [here](${href})`)).toEqual([{ type: "text", text: `see [here](${href})` }]);
      expect(internalHref(href)).toBeNull();
    }
  });

  it("keeps only the in-app part of an absolutised app URL", () => {
    expect(splitLinks("see [D-1](https://example.com/projects/p/decisions?decision=d#x)")).toEqual([
      { type: "text", text: "see " },
      { type: "link", label: "D-1", href: "/projects/p/decisions?decision=d#x" },
    ]);
    expect(splitLinks("see [x](https://example.com/admin)")).toEqual([
      { type: "text", text: "see [x](https://example.com/admin)" },
    ]);
  });

  it("handles several links, no links and empty text", () => {
    expect(splitLinks("[A](/projects/p) and [B](/projects/p/tasks?task=1)")).toEqual([
      { type: "link", label: "A", href: "/projects/p" },
      { type: "text", text: " and " },
      { type: "link", label: "B", href: "/projects/p/tasks?task=1" },
    ]);
    expect(splitLinks("plain")).toEqual([{ type: "text", text: "plain" }]);
    expect(splitLinks("")).toEqual([]);
  });
});

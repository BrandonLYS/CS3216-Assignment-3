import { describe, expect, it } from "vitest";
import { LINK_TEXT_MAX, linkText } from "./comment-body";

describe("linkText", () => {
  it("leaves short URLs untouched", () => {
    expect(linkText("https://example.com/minutes")).toBe("https://example.com/minutes");
  });

  it("truncates long URLs to the display limit with an ellipsis", () => {
    const url = `https://example.com/${"a".repeat(200)}`;
    const text = linkText(url);
    expect(text.endsWith("…")).toBe(true);
    expect(Array.from(text)).toHaveLength(LINK_TEXT_MAX);
    expect(url.startsWith(text.slice(0, -1))).toBe(true);
  });

  it("truncates by code point so multi-byte characters are never split", () => {
    const url = `https://example.com/${"🚀".repeat(100)}`;
    const text = linkText(url);
    expect(text).toBe(Array.from(text).join(""));
    expect(text).not.toMatch(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/);
  });
});

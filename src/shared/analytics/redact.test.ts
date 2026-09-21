import { describe, expect, it } from "vitest";
import { carriesSecret, isCredentialPath, redactUrl } from "./redact";

const TOKEN = "dhc5Xc8WDAtmBrkJbkXO8FYxRwAJecRG";

describe("keeping an invite token out of analytics", () => {
  it("replaces the token in a path, a full URL and a URL with a query", () => {
    expect(redactUrl(`/invite/${TOKEN}`)).toBe("/invite/[token]");
    expect(redactUrl(`http://localhost:3000/invite/${TOKEN}`)).toBe("http://localhost:3000/invite/[token]");
    expect(redactUrl(`https://app.example.com/invite/${TOKEN}?from=email`)).toBe(
      "https://app.example.com/invite/[token]?from=email",
    );
    expect(redactUrl(`https://app.example.com/invite/${TOKEN}#set`)).toBe("https://app.example.com/invite/[token]#set");
  });

  it("leaves every other address alone", () => {
    for (const url of ["/projects/p1/messages", "https://app.example.com/m/p1/login", "/login?next=%2F"]) {
      expect(redactUrl(url)).toBe(url);
      expect(carriesSecret(url)).toBe(false);
    }
  });

  it("names the invite page as the one analytics must not start on", () => {
    // Session recording sends `$snapshot` events that skip `sanitize_properties` entirely, so
    // the only safe answer on this page is to capture nothing at all.
    expect(isCredentialPath(`/invite/${TOKEN}`)).toBe(true);
    expect(isCredentialPath("/projects/p1/messages")).toBe(false);
    expect(isCredentialPath("/m/p1/login")).toBe(false);
  });

  it("flags any property that could carry one, whatever the SDK named it", () => {
    // `$session_entry_url` and `$referrer` are added by posthog-js itself, which is why the
    // sanitizer tests every string property rather than a list of known keys.
    expect(carriesSecret(`http://localhost:3000/invite/${TOKEN}`)).toBe(true);
    expect(carriesSecret(undefined)).toBe(false);
    expect(carriesSecret(42)).toBe(false);
  });
});

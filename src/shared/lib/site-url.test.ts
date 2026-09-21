import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "./site-url";

afterEach(() => vi.unstubAllEnvs());

describe("canonical site origin", () => {
  it("never derives a canonical from a preview hostname", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://prismpm.example");
    vi.stubEnv("VERCEL_URL", "preview-123.vercel.app");
    expect(siteUrl().href).toBe("https://prismpm.example/");
  });

  it("requires an explicit origin for production builds", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "");
    expect(() => siteUrl()).toThrow("Set SITE_URL");
  });

  it.each([
    "http://prismpm.example",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://prismpm.example/landing",
    "https://prismpm.example/?secret=value",
    "https://user:password@prismpm.example",
    "https://prismpm.example/#section",
    "file:///tmp/site",
  ])("rejects unsafe or noncanonical production origin %s", (value) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", value);
    expect(() => siteUrl()).toThrow();
  });

  it("keeps local development usable without deployment configuration", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SITE_URL", "");
    expect(siteUrl().href).toBe("http://localhost:3000/");
  });

  it("does not advertise preview deployments to crawlers", async () => {
    vi.resetModules();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("SITE_URL", "https://prismpm.example");
    const { default: robots } = await import("@/app/robots");
    const { default: sitemap } = await import("@/app/sitemap");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(sitemap()).toEqual([]);
    vi.resetModules();
  });
});

/** The canonical origin is explicit: request hosts and deployment previews are never canonical. */
export function siteUrl() {
  const configured = process.env.SITE_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("Set SITE_URL to the canonical public HTTPS origin before building for production.");
  }
  const url = new URL(configured || "http://localhost:3000");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (process.env.NODE_ENV === "production" &&
      (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  ) {
    throw new Error("SITE_URL must be a public HTTPS origin without a path, query, fragment or credentials.");
  }
  return url;
}

export const isPreview = process.env.VERCEL_ENV === "preview";

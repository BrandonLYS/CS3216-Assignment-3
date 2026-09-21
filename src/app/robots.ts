import type { MetadataRoute } from "next";
import { isPreview, siteUrl } from "@/shared/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  if (isPreview) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/projects", "/calendar", "/settings", "/login", "/signup", "/invite/", "/m/", "/api/"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).href,
  };
}

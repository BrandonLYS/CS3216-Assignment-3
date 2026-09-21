import type { MetadataRoute } from "next";
import { isPreview, siteUrl } from "@/shared/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  return isPreview ? [] : [{ url: siteUrl().href }];
}

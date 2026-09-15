import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /** Evidence uploads are capped at MAX_EVIDENCE_BYTES (15 MB) plus form overhead. */
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;

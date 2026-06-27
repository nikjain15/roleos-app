import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OpenNext on Cloudflare supports the full App Router (SSR, server actions,
  // route handlers) — we deliberately do NOT pin `runtime = 'edge'` per route.
  reactStrictMode: true,
  experimental: {
    // server actions are on by default in Next 15; keep body limit sane for
    // pasted CVs / inbox text.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;

// Enable the Cloudflare bindings (env, KV, DO, Workers AI) during `next dev`
// so local dev mirrors prod. No-op outside the OpenNext dev server.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

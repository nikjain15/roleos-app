import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // H4: CSP + security headers on every route (policy in lib/security-headers).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NODE_ENV === "development", // dev-only 'unsafe-eval' (hydration)
        ),
      },
    ];
  },
  // Route renames (product-voiced): /onboarding → /start, /explore → /the-index.
  // Old links (incl. shipped J1 + explore URLs) keep working, sub-paths included.
  // (307 — not permanently cached, so it stays reversible.)
  async redirects() {
    return [
      { source: "/onboarding", destination: "/start", permanent: false },
      { source: "/explore", destination: "/the-index", permanent: false },
      { source: "/explore/:path*", destination: "/the-index/:path*", permanent: false },
    ];
  },
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

// Enable the Cloudflare bindings (env, KV, DO, Workers AI) during `next dev` so
// local dev mirrors prod. Skipped in CI — there it would try to start a remote
// proxy session that can't connect, failing `next lint` (the build supplies its
// own bindings, so skipping is safe). Local dev is unaffected.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (!process.env.CI) {
  initOpenNextCloudflareForDev();
}

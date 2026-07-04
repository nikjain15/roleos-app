/**
 * Security headers (slice H4). Pure so the policy is unit-tested; consumed by
 * next.config's `headers()` and served on every route by the Worker.
 *
 * CSP notes: Next.js App Router needs 'unsafe-inline' for its inline
 * bootstrap scripts and styles (no nonce plumbing on OpenNext today) — the
 * policy still kills foreign scripts, plugins, and framing outright.
 * connect-src allows only self + our Supabase project (browser auth client).
 *
 * DEV ONLY: `next dev` bundles client JS with eval-based source maps, so the
 * dev server (and every Playwright click driven through it) needs
 * 'unsafe-eval' or hydration dies silently. Production builds contain no eval
 * and never get it — the flag defaults off; next.config passes NODE_ENV.
 */
export function contentSecurityPolicy(supabaseUrl: string | undefined, dev = false): string {
  const supabase = supabaseUrl?.replace(/\/$/, "") ?? "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${supabase ? ` ${supabase}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://mail.google.com",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(
  supabaseUrl: string | undefined,
  dev = false,
): Array<{ key: string; value: string }> {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(supabaseUrl, dev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ];
}

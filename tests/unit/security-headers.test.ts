import { describe, it, expect } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

/** Slice H4 — the header policy, pure. */
describe("contentSecurityPolicy", () => {
  it("locks framing, plugins, and foreign scripts; allows only self + our Supabase for connects", () => {
    const csp = contentSecurityPolicy("https://abc.supabase.co/");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co");
    expect(csp).not.toContain("supabase.co/ "); // trailing slash stripped
    expect(csp).toContain("form-action 'self' https://mail.google.com"); // the compose handoff
  });

  it("omits the supabase origin cleanly when unset", () => {
    expect(contentSecurityPolicy(undefined)).toContain("connect-src 'self';");
  });
});

describe("securityHeaders", () => {
  it("ships the full set", () => {
    const keys = securityHeaders("https://x.supabase.co").map((h) => h.key);
    expect(keys).toEqual([
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]);
  });
});

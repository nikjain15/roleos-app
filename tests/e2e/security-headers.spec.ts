import { test, expect } from "@playwright/test";

/**
 * Slice H4 — security headers are actually SERVED (not just configured).
 * Runs in CI (no secrets needed — `/` and `/login` are the always-on smoke).
 */
const PAGES = ["/", "/login"];

for (const path of PAGES) {
  test(`security headers present on ${path} (D6)`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
  });
}

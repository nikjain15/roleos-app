import { describe, it, expect } from "vitest";
import { clientIp, LIMITS, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Slice H3 — shared rate limiting. Pure parts: IP extraction precedence,
 * budget-table sanity, and the honest 429 shape. (The counting path is
 * DB-coupled and covered by the live E2E, which seeds the window directly.)
 */
describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("https://x.test", { headers });

  it("prefers cf-connecting-ip, then first x-forwarded-for hop, then 'unknown'", () => {
    expect(clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(req({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("LIMITS", () => {
  it("every model-calling route has a sane hourly budget", () => {
    for (const [scope, l] of Object.entries(LIMITS)) {
      expect(l.max, scope).toBeGreaterThan(0);
      expect(l.max, scope).toBeLessThanOrEqual(60);
      expect(l.windowMin, scope).toBe(60);
    }
    // The expensive public path is the tightest.
    expect(LIMITS.onboard.max).toBeLessThanOrEqual(LIMITS.explore_ask.max);
    expect(LIMITS.rematch.max).toBeLessThanOrEqual(LIMITS.tailor.max);
  });
});

describe("rateLimitResponse", () => {
  it("is a 429 with an honest, overridable message", async () => {
    const res = rateLimitResponse();
    expect(res.status).toBe(429);
    const j = (await res.json()) as { error: string };
    expect(j.error).toContain("resets");
    const custom = (await rateLimitResponse("custom copy").json()) as { error: string };
    expect(custom.error).toBe("custom copy");
  });
});

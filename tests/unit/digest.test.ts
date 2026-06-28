import { describe, it, expect } from "vitest";
import { isDigestDue } from "@/lib/digest";

const H = 3_600_000;
const now = 1_000_000_000_000;

describe("digest scheduling · isDigestDue + self-quieting", () => {
  it("a first-ever digest (no prior) is always due", () => {
    expect(isDigestDue("daily", null, null, now)).toBe(true);
  });

  it("daily: not due 12h after the last, due after 24h+ (with recent activity)", () => {
    const active = new Date(now - 1 * H).toISOString(); // activity since last digest
    const last = new Date(now - 12 * H).toISOString();
    expect(isDigestDue("daily", last, active, now)).toBe(false);
    const last25 = new Date(now - 25 * H).toISOString();
    expect(isDigestDue("daily", last25, active, now)).toBe(true);
  });

  it("self-quiets: with NO activity since last digest, the interval doubles", () => {
    const last = new Date(now - 30 * H).toISOString();
    // daily base 24h → but quiet → 48h, so 30h is NOT yet due
    expect(isDigestDue("daily", last, null, now)).toBe(false);
    const last50 = new Date(now - 50 * H).toISOString();
    expect(isDigestDue("daily", last50, null, now)).toBe(true);
  });

  it("weekly is a much longer interval than realtime", () => {
    const active = new Date(now - 1 * H).toISOString();
    const last10h = new Date(now - 10 * H).toISOString();
    expect(isDigestDue("realtime", last10h, active, now)).toBe(true); // 6h base
    expect(isDigestDue("weekly", last10h, active, now)).toBe(false); // 168h base
  });
});

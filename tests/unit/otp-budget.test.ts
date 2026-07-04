import { describe, it, expect } from "vitest";
import {
  otpDelayMs,
  pruneLedger,
  isOtpRateLimit,
  OTP_BUDGET_MAX,
  OTP_WINDOW_MS,
} from "../e2e/live/otp-budget";

/**
 * T2 — the OTP-budget pacing math, pure. The live harness self-paces under
 * Supabase's ~30-per-5-min OTP-verification limit so the full suite runs as
 * ONE command (X1's audit found unpaced runs die mid-suite at ~test #30).
 */

const NOW = 1_000_000_000;

describe("otpDelayMs", () => {
  it("no delay while the window has headroom", () => {
    expect(otpDelayMs([], NOW)).toBe(0);
    const some = Array.from({ length: OTP_BUDGET_MAX - 1 }, (_, i) => NOW - i * 1_000);
    expect(otpDelayMs(some, NOW)).toBe(0);
  });

  it("waits exactly until the oldest blocking entry leaves the window", () => {
    // `max` entries, the oldest 100s into the window → wait ≈ window − 100s.
    const ts = Array.from({ length: OTP_BUDGET_MAX }, (_, i) => NOW - 100_000 + i);
    const wait = otpDelayMs(ts, NOW);
    expect(wait).toBeGreaterThan(OTP_WINDOW_MS - 100_000);
    expect(wait).toBeLessThanOrEqual(OTP_WINDOW_MS - 100_000 + 2_000);
  });

  it("stale and junk timestamps never block", () => {
    const stale = Array.from({ length: 100 }, (_, i) => NOW - OTP_WINDOW_MS - i * 1_000);
    expect(otpDelayMs([...stale, NaN, Infinity - Infinity], NOW)).toBe(0);
  });

  it("more than max in-window entries → still a bounded, correct wait", () => {
    const ts = Array.from({ length: OTP_BUDGET_MAX + 10 }, (_, i) => NOW - i * 100);
    const wait = otpDelayMs(ts, NOW);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(OTP_WINDOW_MS + 2_000);
  });
});

describe("pruneLedger", () => {
  it("drops out-of-window and junk entries, keeps fresh ones", () => {
    const fresh = NOW - 1_000;
    expect(pruneLedger([fresh, NOW - OTP_WINDOW_MS - 1, NaN], NOW)).toEqual([fresh]);
  });
});

describe("isOtpRateLimit", () => {
  it("recognizes Supabase's rate-limit phrasings, ignores real failures", () => {
    expect(isOtpRateLimit(new Error("Rate limit exceeded"))).toBe(true);
    expect(isOtpRateLimit(new Error("over_request_rate_limit"))).toBe(true);
    expect(isOtpRateLimit(new Error("Too many requests (429)"))).toBe(true);
    expect(isOtpRateLimit(new Error("Token has expired or is invalid"))).toBe(false);
    expect(isOtpRateLimit(null)).toBe(false);
  });
});

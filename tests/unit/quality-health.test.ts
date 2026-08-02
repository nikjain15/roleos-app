import { describe, it, expect } from "vitest";
import { assessQualityHealth, QUALITY_THRESHOLDS, type HealthSample } from "@/lib/quality-health";

/**
 * THE "IT IS BROKEN" THRESHOLD (finding SH3).
 *
 * The gap was not observability. `agent_runs` recorded every gate verdict and
 * `/admin` rendered a pass rate. What was missing was a NUMBER: no value of any
 * of those signals was defined as "RO is broken right now". These tests pin the
 * number, so it can be revised deliberately against production data rather than
 * drifting in someone's head.
 *
 * What is NOT tested here, because it is not built: nothing pages anyone. The
 * check emits a structured `quality_health.breached` line and stops. That is
 * stated in lib/quality-health.ts and in docs/runbooks/rollback.md.
 */
const runs = (spec: { status: string; confidence?: string; n: number; skill?: string }[]): HealthSample[] =>
  spec.flatMap(({ status, confidence, n, skill }) =>
    Array.from({ length: n }, () => ({ status, confidence: confidence ?? "strong", skill: skill ?? "tailor" })),
  );

describe("quality health · the threshold that means RO is broken", () => {
  it("is healthy on a normal window", () => {
    const h = assessQualityHealth(runs([{ status: "passed", n: 48 }, { status: "needs_your_eyes", n: 2 }]));
    expect(h.level).toBe("ok");
    expect(h.needsEyesRate).toBeCloseTo(0.04);
  });

  it("warns before it breaches, so there is a chance to look first", () => {
    const h = assessQualityHealth(runs([{ status: "passed", n: 82 }, { status: "needs_your_eyes", n: 18 }]));
    expect(h.level).toBe("warn");
    expect(h.reasons.join(" ")).toContain("needs_your_eyes");
  });

  it("breaches at a needs_your_eyes rate of 25%", () => {
    const h = assessQualityHealth(runs([{ status: "passed", n: 75 }, { status: "needs_your_eyes", n: 25 }]));
    expect(h.level).toBe("breached");
    expect(h.needsEyesRate).toBeCloseTo(QUALITY_THRESHOLDS.needsEyesBreached);
  });

  it("breaches on collapsing confidence even when every run still `passed`", () => {
    // The failure mode a status-only threshold misses: a prompt change that keeps
    // the gate passing while destroying how much RO can vouch for.
    const h = assessQualityHealth(
      runs([
        { status: "passed", confidence: "strong", n: 60 },
        { status: "passed", confidence: "unknown", n: 40 },
      ]),
    );
    expect(h.level).toBe("breached");
    expect(h.reasons.join(" ")).toContain("unknown-confidence");
  });

  it("refuses to call an incident on too few runs, because a page nobody trusts is worse than none", () => {
    const h = assessQualityHealth(runs([{ status: "needs_your_eyes", n: 5 }]));
    expect(h.level).toBe("ok");
    expect(h.needsEyesRate).toBeNull();
    expect(h.reasons[0]).toContain("below the");
  });

  it("counts user-facing runs only, because a critic sub-call is not an answer to anyone", () => {
    const h = assessQualityHealth([
      ...runs([{ status: "passed", n: 30 }]),
      ...runs([{ status: "needs_your_eyes", n: 40, skill: "critic:tailor" }]),
      ...runs([{ status: "needs_your_eyes", n: 40, skill: "truth:tailor" }]),
    ]);
    expect(h.samples).toBe(30);
    expect(h.level).toBe("ok");
  });

  it("names every breached threshold, not just the first", () => {
    const h = assessQualityHealth(
      runs([
        { status: "passed", confidence: "strong", n: 50 },
        { status: "needs_your_eyes", confidence: "unknown", n: 50 },
      ]),
    );
    expect(h.level).toBe("breached");
    expect(h.reasons).toHaveLength(2);
  });

  it("keeps the thresholds as named, reviewable constants rather than magic numbers", () => {
    expect(QUALITY_THRESHOLDS.needsEyesWarn).toBeLessThan(QUALITY_THRESHOLDS.needsEyesBreached);
    expect(QUALITY_THRESHOLDS.unknownWarn).toBeLessThan(QUALITY_THRESHOLDS.unknownBreached);
    expect(QUALITY_THRESHOLDS.minSamples).toBeGreaterThan(0);
    expect(QUALITY_THRESHOLDS.windowMinutes).toBeGreaterThan(0);
  });
});

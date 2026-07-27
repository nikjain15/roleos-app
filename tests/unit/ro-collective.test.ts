import { describe, it, expect } from "vitest";
import { collectivePrior, type CollectiveSignal } from "@/lib/ro/collective";
import { judgeCalibration, type ResumeFeedbackRow } from "@/lib/resume/feedback";

/**
 * M3 — anonymous aggregate learning. The collective prior is derived from
 * de-identified population COUNTS only (no user, no text), stays silent below a
 * k-anon floor, and seeds per-user calibration (cold-start) via shrinkage.
 */

describe("collectivePrior — aggregate-only, k-anon floor", () => {
  const sig = (action: string, signal: string | null, cnt: number): CollectiveSignal => ({ action, signal, cnt });

  it("computes the population correction rate above the floor", () => {
    const p = collectivePrior([
      sig("approve", "lock", 10),
      sig("approve", "export", 6),
      sig("edit", "tune", 6),
      sig("correct", null, 2),
    ]);
    // corrected 8 / total 24
    expect(p.sampleSize).toBe(24);
    expect(p.correctionRate).toBeCloseTo(8 / 24);
    expect(p.note).toContain("8 of 24");
  });

  it("says nothing below the floor (never a pattern from a handful)", () => {
    const p = collectivePrior([sig("approve", "lock", 3), sig("edit", "tune", 2)]);
    expect(p.sampleSize).toBe(5);
    expect(p.correctionRate).toBe(0);
    expect(p.note).toBeNull();
  });

  it("empty → zeros, no note", () => {
    expect(collectivePrior([])).toEqual({ correctionRate: 0, sampleSize: 0, note: null });
  });
});

describe("judgeCalibration — shrinks toward the collective prior", () => {
  const rows = (...specs: Array<[string, string]>): ResumeFeedbackRow[] =>
    specs.map(([action, signal]) => ({ action, payload: { signal } }));

  it("a NEW user (no signal) starts at the population prior", () => {
    const cal = judgeCalibration([], { prior: 0.4 });
    expect(cal.correctionRate).toBeCloseTo(0.4); // pure prior when no own signal
  });

  it("own signal pulls away from the prior as it accrues", () => {
    // 4 corrections, 0 trust, prior 0.1 → (4 + 2*0.1)/(4+2) = 4.2/6
    const cal = judgeCalibration(rows(["edit", "tune"], ["edit", "tune"], ["correct", "x"], ["correct", "x"]), { prior: 0.1 });
    expect(cal.correctionRate).toBeCloseTo(4.2 / 6);
  });

  it("defaults to shrink-toward-zero when no prior (unchanged behavior)", () => {
    expect(judgeCalibration(rows(["edit", "tune"])).correctionRate).toBeCloseTo(1 / 3); // (1+0)/(1+2)
  });
});

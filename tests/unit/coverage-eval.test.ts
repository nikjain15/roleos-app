import { describe, it, expect } from "vitest";
import { evaluateCoverage, type CoverageEvalCase } from "@/evals/coverage/metrics";

/**
 * P1 — the coverage-judge eval metrics. Pure agreement between the judge's
 * verdicts and human gold labels, plus the score error the disagreement causes.
 * This is the ladder model/threshold changes ship behind.
 */

const kase = (id: string, rows: Array<[string, "must_have" | "nice_to_have", "covered" | "partial" | "gap", "covered" | "partial" | "gap"]>): CoverageEvalCase => ({
  id,
  requirements: rows.map(([requirementId, kind, gold, predicted]) => ({ requirementId, kind, gold, predicted })),
});

describe("evaluateCoverage", () => {
  it("perfect agreement → accuracy 1, zero errors", () => {
    const r = evaluateCoverage([
      kase("c1", [
        ["m0", "must_have", "covered", "covered"],
        ["m1", "must_have", "gap", "gap"],
      ]),
    ]);
    expect(r.accuracy).toBe(1);
    expect(r.meanOrdinalError).toBe(0);
    expect(r.overCreditRate).toBe(0);
    expect(r.meanScoreError).toBe(0);
    expect(r.n).toBe(2);
    expect(r.cases).toBe(1);
  });

  it("counts over-crediting separately from under-crediting", () => {
    const r = evaluateCoverage([
      kase("over", [["m0", "must_have", "partial", "covered"]]), // judge too generous
      kase("under", [["m0", "must_have", "covered", "partial"]]), // judge too strict
    ]);
    expect(r.accuracy).toBe(0);
    expect(r.overCreditRate).toBe(0.5); // 1 of 2 requirements over-credited
    expect(r.meanOrdinalError).toBe(1); // each off by one rank
  });

  it("surfaces the rolled-up score gap the disagreement causes", () => {
    // gold: must covered → 100; predicted: must gap → 0. 100-pt error.
    const r = evaluateCoverage([kase("c", [["m0", "must_have", "covered", "gap"]])]);
    expect(r.perCase[0].goldScore).toBe(100);
    expect(r.perCase[0].predictedScore).toBe(0);
    expect(r.meanScoreError).toBe(100);
  });

  it("empty set → zeros, no NaN", () => {
    const r = evaluateCoverage([]);
    expect(r.accuracy).toBe(0);
    expect(r.meanScoreError).toBe(0);
    expect(r.n).toBe(0);
  });
});

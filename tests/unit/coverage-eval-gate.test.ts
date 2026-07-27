import { describe, it, expect } from "vitest";
import { evaluateCoverage, type CoverageEvalCase } from "@/evals/coverage/metrics";
import dataset from "@/evals/coverage/dataset.json";

/**
 * P4 — the eval ladder as a CI GATE (docs/specs/resume-editor-v2.md §"Measured, not
 * claimed"). The coverage judge only "improves" if it agrees with human labels, and
 * that has to be provable, not asserted. This gate runs the labeled fixtures and
 * fails the build if the judge's agreement drops below the floor — so any model /
 * threshold / calibration change ships BEHIND a measured bar, never on a hunch.
 *
 * Fixtures live in evals/coverage/dataset.json; grow them as real (résumé, role)
 * pairs are labeled. Wire live predictions per the dataset's _comment.
 */

const THRESHOLD = 0.7; // verdict-agreement floor; raise as the labeled set grows.
const cases = (dataset as { cases: CoverageEvalCase[] }).cases;

describe("coverage-judge eval gate", () => {
  it("has labeled fixtures to score against", () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) expect(c.requirements.length).toBeGreaterThan(0);
  });

  it("verdict agreement stays at or above the floor", () => {
    const report = evaluateCoverage(cases);
    expect(report.accuracy).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("never over-credits on more than a third of requirements (the dangerous direction)", () => {
    const report = evaluateCoverage(cases);
    // over-crediting (judge more generous than the human) is the failure that
    // inflates a résumé's score — cap it tighter than plain accuracy.
    expect(report.overCreditRate).toBeLessThanOrEqual(0.34);
  });
});

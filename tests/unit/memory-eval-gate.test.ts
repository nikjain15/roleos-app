import { describe, it, expect } from "vitest";
import { evaluateRecall, type RecallCase } from "@/evals/memory/metrics";
import dataset from "@/evals/memory/dataset.json";

/**
 * M3 — the memory recall eval as a CI GATE (docs/specs/ro-memory.md §"Measured, not
 * claimed"). Scores rankRecall against labeled fixtures and fails the build if recall
 * precision drops below the floor — so re-ranker changes ship behind a measured bar.
 */

const THRESHOLD = 0.9; // precision@k floor; raise as the labeled set grows.
const cases = (dataset as { cases: RecallCase[] }).cases;

describe("RO memory recall eval gate", () => {
  it("has labeled fixtures", () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) expect(c.candidates.some((n) => n.relevant)).toBe(true);
  });

  it("re-ranker precision@k stays at or above the floor", () => {
    const report = evaluateRecall(cases);
    expect(report.precisionAtK).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("confidence + scope actually change the ranking (not pure cosine)", () => {
    // The 'confidence-outranks-marginal-similarity' case: the slightly-farther but
    // high-confidence note must win top-1 over the closer low-confidence one.
    const report = evaluateRecall(cases.filter((c) => c.id === "confidence-outranks-marginal-similarity"));
    expect(report.precisionAtK).toBe(1);
  });
});

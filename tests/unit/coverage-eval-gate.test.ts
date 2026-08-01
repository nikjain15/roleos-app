import { describe, it, expect } from "vitest";
import { evaluateCoverage, type CoverageEvalCase } from "@/evals/coverage/metrics";
import dataset from "@/evals/coverage/dataset.json";

/**
 * P4, the coverage agreement HARNESS, checked in CI (docs/specs/resume-editor-v2.md
 * §"Measured, not claimed").
 *
 * READ THIS BEFORE CITING IT AS PROOF OF JUDGE QUALITY, it is not that, yet.
 * `judgeCoverage` (lib/resume/judge.ts) needs a live model call plus bge
 * embeddings, so it cannot run on a PR. Every `predicted` verdict in
 * evals/coverage/dataset.json is therefore a RECORDED label, not a live judge
 * output, and this file scores recorded predictions against the human gold labels.
 *
 * So what these cases genuinely enforce:
 *   • the labeled fixture set exists and is well-formed (no silently empty eval);
 *   • the agreement maths in evals/coverage/metrics.ts is correct and rolls verdicts
 *     up through the REAL production scorer (`scoreResume`), so a calibration change
 *     that distorts the 0–100 roll-up shows up here;
 *   • the recorded fixtures still clear the agreement + over-credit bars, which is
 *     what makes them a usable baseline the day live predictions are wired in.
 *
 * The gap, stated plainly: no CI check today measures the LIVE coverage judge. To
 * close it, replace each requirement's `predicted` with what `judgeCoverage` returns
 * for that (role, bullets) pair (see the dataset's `_comment`) and record the run,
 * or add a model-gated live eval alongside tests/e2e/live/. Until then, do not
 * describe this as gating judge quality. The analogous eval that DOES run
 * production code on every PR is evals/memory/metrics.ts (it imports the real
 * `rankRecall`) and tests/unit/retrieval-live.test.ts (real corpus, real retriever).
 */

const THRESHOLD = 0.7; // verdict-agreement floor; raise as the labeled set grows.
const cases = (dataset as { cases: CoverageEvalCase[] }).cases;

describe("coverage eval harness · recorded predictions vs human labels", () => {
  it("has labeled fixtures to score against", () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) expect(c.requirements.length).toBeGreaterThan(0);
  });

  it("recorded-verdict agreement stays at or above the floor (baseline, not a live judge)", () => {
    const report = evaluateCoverage(cases);
    expect(report.accuracy).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("recorded over-crediting stays under a third of requirements (the dangerous direction)", () => {
    const report = evaluateCoverage(cases);
    // over-crediting (judge more generous than the human) is the failure that
    // inflates a résumé's score — cap it tighter than plain accuracy.
    expect(report.overCreditRate).toBeLessThanOrEqual(0.34);
  });

  it("rolls verdicts up through the production scorer, so a calibration change is visible here", () => {
    // The one place this file touches shipped code: evaluateCoverage scores each
    // case with `scoreResume` + DEFAULT_CALIBRATION. An over-crediting case must
    // score HIGHER than its gold labels warrant, or the roll-up is not being used.
    const report = evaluateCoverage(cases);
    const overCredited = report.perCase.find((p) => p.id === "judge-over-credits-a-partial");
    expect(overCredited, "fixture 'judge-over-credits-a-partial' must exist").toBeDefined();
    expect(overCredited!.predictedScore).toBeGreaterThan(overCredited!.goldScore);
    expect(report.meanScoreError).toBeGreaterThan(0);
  });
});

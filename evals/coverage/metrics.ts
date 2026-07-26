/**
 * Pure agreement metrics for the résumé coverage-judge eval (the J8 §5
 * eval-ladder, docs/specs/resume-editor-v2.md §"Measured, not claimed").
 *
 * We optimise for ONE honest target: does the judge agree with a careful human
 * read of "is this requirement genuinely evidenced?" — never interview odds.
 * These functions compare the judge's per-requirement verdicts against gold
 * human labels, and the rolled-up scores those verdicts produce. Self-contained
 * except for the pure scorer (no network, no model): model/threshold changes
 * ship behind this eval.
 */

import { scoreResume, type CoverageVerdict, type Requirement } from "@/lib/resume/score";
import { DEFAULT_CALIBRATION, type ScoreCalibration } from "@/lib/resume/calibration";

/** Ordinal rank so "off by one" (covered↔partial) counts less than covered↔gap. */
const RANK: Record<CoverageVerdict, number> = { gap: 0, partial: 1, covered: 2 };

export interface LabeledRequirement {
  requirementId: string;
  kind: Requirement["kind"];
  gold: CoverageVerdict;
  predicted: CoverageVerdict;
}

export interface CoverageEvalCase {
  id: string;
  requirements: LabeledRequirement[];
}

export interface AgreementReport {
  n: number; // requirements judged
  cases: number;
  /** Exact-verdict agreement in [0,1]. */
  accuracy: number;
  /** Mean absolute ordinal distance (0 = perfect, 2 = worst). Lower is better. */
  meanOrdinalError: number;
  /** How often the judge is MORE generous than the human — the dangerous direction. */
  overCreditRate: number;
  /** Mean absolute difference of the rolled-up 0–100 score, judge vs gold. */
  meanScoreError: number;
  perCase: Array<{ id: string; accuracy: number; goldScore: number; predictedScore: number }>;
}

const requirementOf = (r: LabeledRequirement): Requirement => ({
  id: r.requirementId,
  text: r.requirementId,
  kind: r.kind,
});

/** Roll a set of verdicts into the honest 0–100 via the real scorer. */
function rollUp(
  reqs: LabeledRequirement[],
  pick: (r: LabeledRequirement) => CoverageVerdict,
  cal: ScoreCalibration,
): number {
  return scoreResume(
    {
      requirements: reqs.map(requirementOf),
      coverage: reqs.map((r) => ({
        requirementId: r.requirementId,
        verdict: pick(r),
        reason: "",
        evidenceBulletIds: [],
      })),
      sections: [],
    },
    cal,
  ).score;
}

export function evaluateCoverage(
  cases: CoverageEvalCase[],
  cal: ScoreCalibration = DEFAULT_CALIBRATION,
): AgreementReport {
  let n = 0;
  let exact = 0;
  let ordinalSum = 0;
  let overCredit = 0;

  const perCase = cases.map((c) => {
    let caseExact = 0;
    for (const r of c.requirements) {
      n++;
      if (r.predicted === r.gold) {
        exact++;
        caseExact++;
      }
      const diff = RANK[r.predicted] - RANK[r.gold];
      ordinalSum += Math.abs(diff);
      if (diff > 0) overCredit++; // judge credited more than the human
    }
    const goldScore = rollUp(c.requirements, (r) => r.gold, cal);
    const predictedScore = rollUp(c.requirements, (r) => r.predicted, cal);
    return {
      id: c.id,
      accuracy: c.requirements.length ? caseExact / c.requirements.length : 0,
      goldScore,
      predictedScore,
    };
  });

  const meanScoreError = perCase.length
    ? perCase.reduce((s, p) => s + Math.abs(p.predictedScore - p.goldScore), 0) / perCase.length
    : 0;

  return {
    n,
    cases: cases.length,
    accuracy: n ? exact / n : 0,
    meanOrdinalError: n ? ordinalSum / n : 0,
    overCreditRate: n ? overCredit / n : 0,
    meanScoreError,
    perCase,
  };
}

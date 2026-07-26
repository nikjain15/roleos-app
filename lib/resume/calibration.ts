/**
 * Résumé coverage-score calibration (docs/specs/resume-editor-v2.md §"The score").
 *
 * The score = coverage of the role's stated requirements by real evidence — NOT
 * a prediction of interview odds. Every knob that turns a set of per-requirement
 * coverage verdicts into a 0–100 number and an honest tier lives HERE, in one
 * config object, so P4's calibration loop has a single, versioned surface to
 * recalibrate (feedback → `decision_events` → new weights/thresholds behind the
 * held-out eval). Nothing downstream hard-codes a weight or a cutoff.
 *
 * INVARIANT — "Fully evidenced" can never be reached by partial credit alone:
 * it requires ZERO gaps AND ZERO partials (the truth-gate cap, spec §112). A
 * résumé of all-partial evidence tops out one tier below, honestly.
 */

/** Relative importance of a requirement by kind. Must-have ≫ nice-to-have. */
export interface CoverageWeights {
  must_have: number;
  nice_to_have: number;
}

/** Credit a coverage verdict earns toward the score, in [0, 1]. */
export interface CoverageCredit {
  covered: number;
  partial: number;
  gap: number;
}

/** One honest tier. `min` is the inclusive 0–100 floor to reach it. */
export interface Tier {
  id: string;
  label: string;
  min: number;
}

export interface ScoreCalibration {
  /** Bumped whenever any knob below changes — stamped onto every score for
   *  provenance, so P4 can tell which calibration produced a stored number. */
  version: string;
  weights: CoverageWeights;
  credit: CoverageCredit;
  /** Ascending by `min`. The LAST tier is the "fully evidenced" ceiling and is
   *  gated on zero gaps/partials, never on the numeric score alone. */
  tiers: Tier[];
  /** Which tier id is the evidence-complete ceiling (see the INVARIANT above). */
  fullyEvidencedTierId: string;
}

/**
 * The documented defaults. Honest tiers, no outcome/odds language:
 * Thin → Solid → Strong → Fully evidenced (spec §"Honest tiers").
 * P4 will write a recalibrated object; until then these are the contract.
 */
export const DEFAULT_CALIBRATION: ScoreCalibration = {
  version: "resume-coverage-2026.07",
  weights: { must_have: 3, nice_to_have: 1 },
  credit: { covered: 1, partial: 0.5, gap: 0 },
  tiers: [
    { id: "thin", label: "Thin for this role", min: 0 },
    { id: "solid", label: "Solid", min: 55 },
    { id: "strong", label: "Strong", min: 78 },
    { id: "fully", label: "Fully evidenced", min: 100 },
  ],
  fullyEvidencedTierId: "fully",
};

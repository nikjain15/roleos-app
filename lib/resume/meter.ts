/**
 * Readiness-meter view model (docs/specs/resume-editor-v2.md §"The editor UX" #1).
 *
 * PURE: turns a P1 ResumeScore (+ optional master→tailored lift) into exactly what
 * the slim readiness meter renders — the honest tier badge, the tiered track with
 * the score marker, `+N from your master`, the one next move, and the fixed caveat
 * line. No score is ever framed as interview odds; the caveat is not optional copy,
 * it's part of the contract. Kept pure so the display logic is unit-tested without
 * a model call or the DOM.
 */

import type { ResumeScore, ScoreLift } from "./score";
import { DEFAULT_CALIBRATION, type ScoreCalibration, type Tier } from "./calibration";

/** The one honest caveat — shown always, never softened into a prediction. */
export const READINESS_CAVEAT =
  "How strongly your résumé makes your case for this role — not your odds of an interview.";

export interface MeterTrackTier {
  id: string;
  label: string;
  /** Left edge of this tier's band on the 0–100 track. */
  startPct: number;
}

export interface MeterView {
  score: number;
  tierId: string;
  tierLabel: string;
  /** `+N from your master`; null when there's nothing to compare against. */
  lift: number | null;
  /** The single highest-leverage next move, or null when fully evidenced. */
  nextMove: { text: string; deltaPoints: number } | null;
  caveat: string;
  track: {
    /** Non-ceiling tiers, left→right, as labeled bands under the track. */
    tiers: MeterTrackTier[];
    /** Where the score marker sits, 0–100. */
    markerPct: number;
  };
}

/** Build the meter's display model from a score. Pure. */
export function meterView(
  score: ResumeScore,
  opts: { lift?: ScoreLift | null; calibration?: ScoreCalibration } = {},
): MeterView {
  const cal = opts.calibration ?? DEFAULT_CALIBRATION;

  // The track shows the reachable bands; the evidence-gated ceiling isn't a
  // numeric band you cross, so it's not drawn as one.
  const tiers: MeterTrackTier[] = cal.tiers
    .filter((t: Tier) => t.id !== cal.fullyEvidencedTierId)
    .map((t) => ({ id: t.id, label: t.label, startPct: Math.max(0, Math.min(100, t.min)) }));

  const lift = opts.lift ? opts.lift.delta : null;

  return {
    score: score.score,
    tierId: score.tier.id,
    tierLabel: score.tier.label,
    lift,
    nextMove: score.nextMove ? { text: score.nextMove.text, deltaPoints: score.nextMove.deltaPoints } : null,
    caveat: READINESS_CAVEAT,
    track: { tiers, markerPct: Math.max(0, Math.min(100, score.score)) },
  };
}

/** "+14 from your master" / "−3 from your master" / null. Honest sign. */
export function liftLabel(lift: number | null): string | null {
  if (lift === null || lift === 0) return null;
  return `${lift > 0 ? "+" : "−"}${Math.abs(lift)} from your master`;
}

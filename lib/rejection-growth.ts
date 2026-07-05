/**
 * Rejection → growth (slice X11, docs/specs/x11-rejection-growth.md) — turns a
 * logged rejection into a calm, opt-in two-minute reflection. Pure and
 * DETERMINISTIC: every line traces to a real X4 lift, a real X3 score, or the
 * stated base rate — NO model call, so nothing is invented (a rejection is
 * exactly the moment not to risk a hallucinated "silver lining"). It reflects
 * and proposes one lever; it changes nothing and sends nothing.
 */

import { featureLabel, type OutcomeLifts, type FeatureStat } from "@/lib/outcome-learning";

/** X3's calibration signal for the rejected application's résumé. */
export interface ReflectionScore {
  score: number; // 0–100
  likelihood: string; // e.g. "high" | "medium" | "low"
}

export interface ReflectionInput {
  /** The rejected role's learnable features (from roleFeatures()). */
  features: string[];
  /** The user's outcome model (from learnLifts()). */
  lifts: OutcomeLifts;
  /** The résumé's app_score if present (X3). */
  score: ReflectionScore | null;
}

export type AdjustmentLever = "targeting" | "resume" | "pace";

export interface Adjustment {
  lever: AdjustmentLever;
  text: string;
}

export interface ReasonOption {
  value: string;
  label: string;
}

/** Fixed reason taxonomy — the signal the outcome model gains. */
export const REASON_OPTIONS: ReasonOption[] = [
  { value: "no_response", label: "Never heard back" },
  { value: "after_screen", label: "Passed on after a screen" },
  { value: "after_interview", label: "Passed on after interviewing" },
  { value: "role_closed", label: "Role was closed or paused" },
  { value: "not_a_fit", label: "Not the right fit either way" },
  { value: "other", label: "Something else" },
];

export interface Reflection {
  acknowledgment: string;
  /** Grounded observations — each traces to real data or the base rate. */
  dataPoints: string[];
  oneAdjustment: Adjustment;
  reasonOptions: ReasonOption[];
}

function pct(x: number): number {
  return Math.round(x * 100);
}

/** The role's own features that the model has evidence on, strongest signal first. */
function evidencedFeatures(
  features: string[],
  lifts: OutcomeLifts,
): Array<{ feature: string; stat: FeatureStat }> {
  const hits: Array<{ feature: string; stat: FeatureStat }> = [];
  for (const f of features) {
    const stat = lifts.byFeature.get(f);
    if (stat && stat.lift !== 0) hits.push({ feature: f, stat });
  }
  return hits.sort((a, b) => Math.abs(b.stat.lift) - Math.abs(a.stat.lift));
}

/** The user's single strongest converting feature overall (for a targeting nudge). */
function bestOverall(lifts: OutcomeLifts): { feature: string; stat: FeatureStat } | null {
  let best: { feature: string; stat: FeatureStat } | null = null;
  for (const [feature, stat] of lifts.byFeature) {
    if (stat.lift <= 0) continue;
    if (!best || stat.lift > best.stat.lift) best = { feature, stat };
  }
  return best;
}

export function buildReflection(input: ReflectionInput): Reflection {
  const { features, lifts, score } = input;
  const dataPoints: string[] = [];

  // 1) Base rate — always honest about how much this one data point means.
  if (lifts.decided > 0) {
    dataPoints.push(
      `Across the ${lifts.decided} application${lifts.decided === 1 ? "" : "s"} that have resolved, about ${pct(
        lifts.base,
      )}% got past a first screen. One no is one data point — it doesn't move that much.`,
    );
  } else {
    dataPoints.push(
      "Senior searches are mostly no's, especially early — this is one data point, not a trend, and not a verdict on you.",
    );
  }

  const hits = evidencedFeatures(features, lifts);
  const strong = hits.find((h) => h.stat.lift > 0);
  const weak = hits.find((h) => h.stat.lift < 0);

  // 2) What the funnel actually says about this role's features.
  if (strong) {
    dataPoints.push(
      `Roles like this one lean on “${featureLabel(strong.feature)}”, which has been landing for you (${strong.stat.wins}/${strong.stat.n}). This wasn't a bad bet.`,
    );
  }
  if (weak && weak.feature !== strong?.feature) {
    dataPoints.push(
      `“${featureLabel(weak.feature)}” roles have been tougher for you so far (${weak.stat.wins}/${weak.stat.n}) — worth noticing, not worth dwelling on.`,
    );
  }

  // 3) Calibration honesty from X3.
  if (score) {
    const high = score.score >= 70 || score.likelihood.toLowerCase() === "high";
    if (high) {
      dataPoints.push(
        `The fit here read strong (${score.score}) — this was a genuine near miss. Keep aiming at ones like it.`,
      );
    } else {
      dataPoints.push(
        `The fit here read modest (${score.score}) — a no is roughly what the numbers expected. The next ones can be higher-fit.`,
      );
    }
  }

  // One adjustment — exactly one lever, chosen deterministically.
  const oneAdjustment = pickAdjustment({ weak, lifts, score });

  return {
    acknowledgment:
      "That's a real one — you put the work in and it still didn't land. That stings, and it's allowed to.",
    dataPoints,
    oneAdjustment,
    reasonOptions: REASON_OPTIONS,
  };
}

function pickAdjustment(args: {
  weak: { feature: string; stat: FeatureStat } | undefined;
  lifts: OutcomeLifts;
  score: ReflectionScore | null;
}): Adjustment {
  const { weak, lifts, score } = args;

  // Safe floor: no evidence yet → don't fabricate a trend; nudge steady volume.
  if (lifts.decided === 0) {
    return {
      lever: "pace",
      text: "Too early to read a pattern. Keep a steady, sustainable pace and we'll learn what converts for you together.",
    };
  }

  // 1) A weak-but-fixable feature this role leaned on → sharpen the résumé (or aim elsewhere).
  if (weak) {
    return {
      lever: "resume",
      text: `This role leaned on “${featureLabel(weak.feature)}”, which hasn't been converting for you. Either make that story sharper on your résumé, or lean toward roles where you're already landing.`,
    };
  }

  // 2) There's a clearly stronger feature to aim at → targeting.
  const best = bestOverall(lifts);
  if (best) {
    return {
      lever: "targeting",
      text: `Lean toward “${featureLabel(best.feature)}” roles — they've been converting best for you (${best.stat.wins}/${best.stat.n}). One adjustment, not a pivot.`,
    };
  }

  // 3) Quality looks fine (esp. a high-fit near miss) → volume is the lever.
  const highFit = score ? score.score >= 70 || score.likelihood.toLowerCase() === "high" : false;
  return {
    lever: "pace",
    text: highFit
      ? "The fit was there — nothing to fix in how you're targeting. Steady volume is the lever now; the near misses turn into yeses."
      : "Nothing here points to a single fixable gap. Keep a steady pace and let the sample grow before changing course.",
  };
}

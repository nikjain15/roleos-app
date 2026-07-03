import type { Observed, Rate, Rates, Stage } from "./types";

/**
 * Funnel conversion rates — priors blended toward the user's real rates
 * (goal-engine.md §7b·A). Empirical-Bayes: each stage starts from a published
 * senior-PM prior with a pseudo-count (`strength`), and shrinks toward personal
 * observed rates as events accrue — small n leans on the prior, large n on you.
 * Ranges are surfaced everywhere; we never show false precision.
 *
 * PRIORS (v1): derived from the spec's own senior-PM funnel (§3: ~25–40 targeted
 * apps ⇒ ~8–12 first interviews ⇒ ~3–5 finals ⇒ 1 offer). Wide uncertainty.
 * OPEN QUESTION (flagged to owner): swap in a firmer cited public benchmark.
 */
interface Prior {
  mean: number;
  strength: number; // pseudo-trials — how many real trials to equal the prior
}

export const PRIORS: Record<Stage, Prior> = {
  apply_to_screen: { mean: 0.3, strength: 20 }, // ~33 targeted apps → ~10 screens
  screen_to_onsite: { mean: 0.4, strength: 12 }, // ~10 screens → ~4 onsites
  onsite_to_offer: { mean: 0.25, strength: 8 }, // ~4 onsites → 1 offer
};

/**
 * Beta posterior for one stage. Prior contributes `strength` pseudo-trials at
 * `mean`; observed adds real conversions/trials. Returns mean + a ~68% credible
 * band (±1 sd of the Beta), clamped to (0,1).
 */
function blendStage(prior: Prior, obs?: { conversions: number; trials: number }): Rate {
  const priorAlpha = prior.mean * prior.strength;
  const priorBeta = (1 - prior.mean) * prior.strength;
  const conversions = obs?.conversions ?? 0;
  const trials = obs?.trials ?? 0;

  const alpha = priorAlpha + conversions;
  const beta = priorBeta + (trials - conversions);
  const mid = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const sd = Math.sqrt(variance);

  return {
    mid,
    low: clamp01(mid - sd),
    high: clamp01(mid + sd),
    n: trials,
  };
}

export function computeRates(observed: Observed = {}): Rates {
  return {
    apply_to_screen: blendStage(PRIORS.apply_to_screen, observed.apply_to_screen),
    screen_to_onsite: blendStage(PRIORS.screen_to_onsite, observed.screen_to_onsite),
    onsite_to_offer: blendStage(PRIORS.onsite_to_offer, observed.onsite_to_offer),
  };
}

function clamp01(x: number): number {
  return Math.max(0.01, Math.min(0.99, x));
}

import type { Observed, Rate, Rates, Stage } from "./types";

/**
 * Funnel conversion rates — priors blended toward the user's real rates
 * (goal-engine.md §7b·A). Empirical-Bayes: each stage starts from a published
 * senior-PM prior with a pseudo-count (`strength`), and shrinks toward personal
 * observed rates as events accrue — small n leans on the prior, large n on you.
 * Ranges are surfaced everywhere; we never show false precision.
 *
 * PRIORS (v1 — cited): the TARGETED funnel for a qualified senior candidate who
 * applies selectively to matched roles with a tailored résumé (RoleOS's whole
 * value prop), NOT the ~3% spray-and-pray job-board aggregate. Sources + rationale
 * in `docs/specs/funnel-priors.md`. Wide uncertainty (moderate pseudo-counts) so
 * the user's real rates take over quickly (dimension 14).
 *
 *   apply→screen  0.12  — qualified + tailored converts ~4–12% (vs ~3% aggregate);
 *                         Career.IO 2025: avg successful seeker 32 apps → 4 interviews (12.5%).
 *   screen→onsite 0.45  — first interview → final/onsite loop.
 *   onsite→offer  0.35  — onsite→offer benchmark is ~30–40%.
 *   ⇒ ~50 targeted apps → ~6 first interviews → ~3 final rounds → 1 offer, matching
 *     the "21–80 applications = highest offer probability" band.
 */
interface Prior {
  mean: number;
  strength: number; // pseudo-trials — how many real trials to equal the prior
}

export const PRIORS: Record<Stage, Prior> = {
  apply_to_screen: { mean: 0.12, strength: 12 }, // ~50 targeted apps → ~6 screens
  screen_to_onsite: { mean: 0.45, strength: 10 }, // ~6 screens → ~3 onsites
  onsite_to_offer: { mean: 0.35, strength: 8 }, // ~3 onsites → 1 offer
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

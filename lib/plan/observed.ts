import type { Observed } from "./types";

/**
 * Derive the user's REAL funnel conversions from their applications (dimension 14)
 * so the pace engine's rates blend toward lived data (goal-engine.md §7b·A). Pure:
 * takes application rows (stage + append-only stage_history) and returns per-stage
 * {conversions, trials} for `computeRates`.
 *
 * Each application counts once, at the FURTHEST funnel stage it reached (from its
 * history — a later rejection doesn't erase that it got there). rejected/withdrawn
 * are terminal markers, not funnel progress.
 */
const FUNNEL_RANK: Record<string, number> = {
  saved: 0,
  drafting: 1,
  ready: 2,
  applied: 3,
  screening: 4,
  interviewing: 5,
  onsite: 6,
  offer: 7,
};

export interface AppLike {
  stage: string;
  stage_history?: Array<{ stage?: string }> | null;
}

/** Highest funnel rank this application reached (from current stage + history). */
export function furthestRank(app: AppLike): number {
  let max = FUNNEL_RANK[app.stage] ?? -1;
  for (const h of app.stage_history ?? []) {
    const r = FUNNEL_RANK[h.stage ?? ""] ?? -1;
    if (r > max) max = r;
  }
  return max;
}

export function observedFromApplications(apps: AppLike[]): Observed {
  const reachedApplied = apps.filter((a) => furthestRank(a) >= FUNNEL_RANK.applied).length;
  const reachedScreen = apps.filter((a) => furthestRank(a) >= FUNNEL_RANK.screening).length;
  const reachedOnsite = apps.filter((a) => furthestRank(a) >= FUNNEL_RANK.onsite).length;
  const reachedOffer = apps.filter((a) => furthestRank(a) >= FUNNEL_RANK.offer).length;

  const observed: Observed = {};
  // Only report a stage once it has ≥1 real trial — otherwise leave it to the prior.
  if (reachedApplied > 0) {
    observed.apply_to_screen = { conversions: reachedScreen, trials: reachedApplied };
  }
  if (reachedScreen > 0) {
    observed.screen_to_onsite = { conversions: reachedOnsite, trials: reachedScreen };
  }
  if (reachedOnsite > 0) {
    observed.onsite_to_offer = { conversions: reachedOffer, trials: reachedOnsite };
  }
  return observed;
}

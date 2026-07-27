/**
 * Anonymous aggregate learning (docs/specs/ro-memory.md, M3 §"Two kinds of
 * learning"). Personalization at scale WITHOUT exposing anyone's private data: from
 * de-identified population COUNTS of résumé feedback (action + signal category, no
 * user_id, no text — see the collective_resume_signals SECURITY DEFINER function),
 * derive a "collective prior" — the population base rate at which RO's drafts get
 * corrected vs trusted. That prior seeds per-user calibration so a NEW user benefits
 * from what worked across everyone (better cold-start), while their own signal takes
 * over as it accrues.
 *
 * Honest guardrails:
 *  • only surfaced above a k-anonymity-ish floor (never a pattern from a handful);
 *  • aggregate-only in, aggregate-only out — no note ever crosses users;
 *  • a prior, not a verdict — it nudges defaults, never predicts an outcome.
 *
 * `collectivePrior` is PURE (unit-tested); the load is a thin service-role bridge.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** One de-identified aggregate row (from collective_resume_signals). */
export interface CollectiveSignal {
  action: string;
  signal: string | null;
  cnt: number;
}

export interface CollectivePrior {
  /** Population base correction rate in [0,1] — the shrinkage target for new users. */
  correctionRate: number;
  /** Total aggregate signals the prior stands on. */
  sampleSize: number;
  /** One honest sentence, or null below the k-anon floor (say nothing). */
  note: string | null;
}

/** Below this total, we derive no prior (don't reveal patterns from too little). */
const MIN_AGG = 20;

export function collectivePrior(signals: CollectiveSignal[]): CollectivePrior {
  let trusted = 0;
  let corrected = 0;
  for (const s of signals) {
    const n = Number.isFinite(s.cnt) ? s.cnt : 0;
    if (s.action === "approve" && (s.signal === "lock" || s.signal === "export")) trusted += n;
    else if (s.action === "edit" && s.signal === "tune") corrected += n;
    else if (s.action === "correct") corrected += n; // re-ground
  }
  const sampleSize = trusted + corrected;
  if (sampleSize < MIN_AGG) return { correctionRate: 0, sampleSize, note: null };
  const correctionRate = corrected / sampleSize;
  return {
    correctionRate,
    sampleSize,
    note: `Across everyone, RO's drafts were corrected ${corrected} of ${sampleSize} times.`,
  };
}

/**
 * Load the de-identified population signals via the SECURITY DEFINER aggregate
 * function. MUST use the service-role client (the function is granted to it only).
 * Fail-safe: returns an empty prior if the migration isn't applied or the call errors.
 */
export async function loadCollectivePrior(service: SupabaseClient): Promise<CollectivePrior> {
  try {
    const { data, error } = await service.rpc("collective_resume_signals");
    if (error) throw error;
    return collectivePrior((data ?? []) as CollectiveSignal[]);
  } catch {
    return { correctionRate: 0, sampleSize: 0, note: null };
  }
}

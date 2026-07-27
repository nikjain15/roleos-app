/**
 * Résumé calibration feedback (docs/specs/resume-editor-v2.md §"Keeping the
 * algorithm strong"). The coverage judge improves ONLY on how well it judges
 * coverage — never a fabricated outcome oracle. This module is the substrate:
 *
 *  1. Pure event-builders that turn real user actions into append-only
 *     `decision_events` (the same substrate as taste) — locking a line (trust),
 *     accepting a tune (a directed correction), exporting (trust enough to use it).
 *  2. A pure, derived calibration READ-BACK — counting in the open, with small-n
 *     shrinkage — of how often RO's drafts get corrected vs trusted. It's used to
 *     DETECT miscalibration ("scores cluster high but users keep correcting → our
 *     weighting is off"), NEVER to predict an outcome. Honest: "read from N signals."
 *
 * Guardrail: the truth-gate still caps the score elsewhere — feedback can tune how
 * we JUDGE coverage, never invent evidence. Pure + deterministic; routes persist.
 */

import type { DecisionEventRow } from "@/lib/onboarding-events";
import type { ResumeExperience } from "./doc";

/** Signal tag carried in payload so the read-back can tell trust from correction. */
export type ResumeSignal = "lock" | "tune" | "export";

const ref = (artifactId: string, suffix = "") => `resume:${artifactId}${suffix ? `:${suffix}` : ""}`;

/**
 * Newly-locked lines → `approve` events. Diffs prev vs next experience: a line that
 * became `locked` is the user vouching for RO's phrasing (positive judge signal).
 */
export function lockApproveEvents(
  prev: ResumeExperience[],
  next: ResumeExperience[],
  artifactId: string,
): DecisionEventRow[] {
  const wasLocked = new Set<string>();
  for (const s of prev) for (const l of s.lines) if (l.locked) wasLocked.add(l.id);

  const rows: DecisionEventRow[] = [];
  for (const s of next) {
    for (const l of s.lines) {
      if (l.locked && !wasLocked.has(l.id)) {
        rows.push({ kind: "resume", subject_ref: ref(artifactId, l.id), action: "approve", payload: { signal: "lock", artifactId, lineId: l.id }, weight: 1 });
      }
    }
  }
  return rows;
}

/** Accepting a tune = a directed correction of RO's draft (strong judge signal). */
export function tuneAcceptEvent(artifactId: string, instruction: string, sectionId?: string): DecisionEventRow {
  return {
    kind: "resume",
    subject_ref: ref(artifactId, sectionId ? `section:${sectionId}` : "all"),
    action: "edit",
    payload: { signal: "tune", artifactId, sectionId: sectionId ?? null, instruction: instruction.slice(0, 300) },
    weight: 2,
  };
}

/** Exporting = trusted the draft enough to use it (positive). */
export function exportEvent(artifactId: string, format: string): DecisionEventRow {
  return {
    kind: "resume",
    subject_ref: ref(artifactId, "export"),
    action: "approve",
    payload: { signal: "export", artifactId, format },
    weight: 2,
  };
}

// ── calibration read-back (derived, honest, never a prediction) ──────────────

/** The résumé feedback rows the read-back reads (a slice of decision_events). */
export interface ResumeFeedbackRow {
  action: string;
  payload?: { signal?: string } | null;
}

export interface JudgeCalibration {
  /** Total résumé calibration signals seen. */
  signals: number;
  /** Trust signals: locked lines + exports. */
  trusted: number;
  /** Correction signals: tunes + re-grounds. */
  corrected: number;
  /** Shrunk correction rate in [0,1): corrected / (trusted + corrected + K). */
  correctionRate: number;
  /** One honest sentence, or null when there's too little to say. */
  note: string | null;
}

/** Two silent observations pull the rate toward zero (small-n prior). */
const SHRINK_K = 2;
/** Below this, we say nothing (never fabricate a calibration read). */
const MIN_SIGNALS = 4;

export function judgeCalibration(
  rows: ResumeFeedbackRow[],
  opts: { prior?: number } = {},
): JudgeCalibration {
  let trusted = 0;
  let corrected = 0;
  for (const r of rows) {
    const sig = r.payload?.signal;
    if (r.action === "approve" && (sig === "lock" || sig === "export")) trusted++;
    else if (r.action === "edit" && sig === "tune") corrected++;
    else if (r.action === "correct") corrected++; // re-ground (from the reground route)
  }
  const signals = trusted + corrected;
  // Shrink toward the ANONYMOUS COLLECTIVE prior (M3) instead of 0 — a new user
  // starts from what worked across everyone, and their own signal takes over as it
  // accrues. `prior` defaults to 0 (shrink to none), preserving prior behavior.
  const prior = typeof opts.prior === "number" ? Math.max(0, Math.min(1, opts.prior)) : 0;
  const correctionRate = (corrected + SHRINK_K * prior) / (signals + SHRINK_K);
  const note =
    signals < MIN_SIGNALS
      ? null
      : `Coverage judge read from ${signals} signal${signals === 1 ? "" : "s"}: ${corrected} correction${corrected === 1 ? "" : "s"} vs ${trusted} kept.`;
  return { signals, trusted, corrected, correctionRate, note };
}

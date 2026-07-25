/**
 * Save-payload → decision_events (onboarding J1, PRD §5.2). On first sign-in the
 * onboarding handoff must carry EVERY pre-save action — the ✓/✗ on each mirror
 * statement, free-text corrections, the target answer, and any re-rank request —
 * so the taste model's first entries are the corrections the user made before
 * they ever signed up. Corrections land at HIGH weight; confirmations at 1.
 *
 * Pure + deterministic: same input → same rows (idempotency is enforced by the
 * caller writing these only on first auth; see app/api/save/route.ts).
 */

export type MirrorReaction = {
  /** The exact statement RO showed. */
  statement: string;
  /** confirm = tapped ✓; correct = tapped ✗ (with free-text or a chip choice). */
  verdict: "confirm" | "correct";
  /** The correction text/chip when verdict === "correct". */
  correction?: string;
  /** True for the target-guess statement (visually distinct in the UI). */
  isGuess?: boolean;
};

export type OnboardingActions = {
  /** S1 optional target ("What job do you want next?") or a corrected guess. */
  target?: string | null;
  /** Per-statement reactions on the mirror (S3). */
  mirrorReactions?: MirrorReaction[];
  /** True if the user asked RO to re-rank after correcting the target. */
  reranked?: boolean;
  /** Roles compared against (for the view row's provenance). */
  scanned?: number;
  /** How many matches were saved. */
  savedMatches?: number;
};

/** A decision_events row without user_id (the route scopes it to auth.uid()). */
export type DecisionEventRow = {
  kind: string;
  subject_ref: string | null;
  action: "send" | "skip" | "edit" | "reject" | "correct" | "approve" | "view";
  payload: Record<string, unknown>;
  weight: number;
};

// Weight scale — an explicit correction is worth far more than a passive view.
const W = { view: 1, confirm: 1, rerank: 2, target: 3, correct: 3 } as const;

/**
 * Map the pre-save onboarding actions to append-only decision_events rows.
 * Order is stable; empty/whitespace corrections are dropped (no empty signal).
 */
export function onboardingEvents(a: OnboardingActions): DecisionEventRow[] {
  const rows: DecisionEventRow[] = [];

  // The moment itself — provenance for how many roles were compared.
  rows.push({
    kind: "onboarding",
    subject_ref: null,
    action: "view",
    payload: { scanned: a.scanned ?? null, saved_matches: a.savedMatches ?? 0 },
    weight: W.view,
  });

  // The target answer seeds the future Goal draft + sharpens ranking (high weight).
  const target = a.target?.trim();
  if (target) {
    rows.push({
      kind: "onboarding",
      subject_ref: null,
      action: "correct",
      payload: { field: "target", value: target },
      weight: W.target,
    });
  }

  // Per-statement mirror reactions — confirmations (1) and corrections (3).
  for (const r of a.mirrorReactions ?? []) {
    const statement = r.statement?.trim();
    if (!statement) continue;
    if (r.verdict === "confirm") {
      rows.push({
        kind: "mirror",
        subject_ref: statement,
        action: "approve",
        payload: { statement, is_guess: !!r.isGuess },
        weight: W.confirm,
      });
    } else {
      const correction = r.correction?.trim();
      if (!correction) continue; // a ✗ with no correction carries no learnable signal
      rows.push({
        kind: "mirror",
        subject_ref: statement,
        action: "correct",
        payload: { statement, correction, is_guess: !!r.isGuess },
        weight: W.correct,
      });
    }
  }

  // A re-rank request is a real preference signal (medium weight).
  if (a.reranked) {
    rows.push({
      kind: "match",
      subject_ref: null,
      action: "edit",
      payload: { rerank: true, target: target ?? null },
      weight: W.rerank,
    });
  }

  return rows;
}

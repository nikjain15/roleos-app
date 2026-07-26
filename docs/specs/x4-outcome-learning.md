# X4, Outcome-learning fit model (PRD)

> Roadmap-v2 Phase X, slice X4. Needs: X3 (merged, its stored score-at-send +
> outcome pairs are this slice's substrate). First commit of `v2/x4-outcome-learning`.

## Problem

RO's fit scores and X3's screen-likelihood scores are calibrated opinions, but they never
learn from what actually happens to THIS user. A candidate whose applications convert to
screens only in platform-PM roles keeps seeing the same fit ordering as day one; a "high"
X3 score that keeps losing to silence stays confidently "high". The funnel already records
the truth (`applications.stage_history`); nothing reads it back into recommendations.

## Goals

1. **Fit learns from outcomes.** Real per-user outcomes (reached screen or further vs
   rejected/withdrawn at applied) adjust the fit score shown on future recommendations -
   bounded, deterministic, and **always explained** ("+4 · roles like this converted 2/3
   for you").
2. **X3 scores get a calibration read-back.** The apply-score card shows how the user's
   past scores actually converted ("your 'high' scores: 3/4 reached a screen"), honest n
   always visible.
3. **Transparent + cheap.** Zero model calls, zero migration, RLS-scoped reads only;
   derived at render time so it always reflects the latest funnel truth.

## Non-goals

- No black-box ML and no model calls, this is counting with shrinkage, shown in the open.
- No mutation of stored `matches.fit_score` (the model's raw opinion stays honest
  provenance; the adjustment is a labelled overlay).
- No auto re-ranking of recommendations past the pursue/maybe boundary (the chip informs;
  RO doesn't silently flip its verdicts, verdict changes stay with the match reasoner).
- No cross-user learning (each user's outcomes are theirs alone; n is small and personal).

## Approach (deterministic, read-time)

**`lib/outcome-learning.ts`:** pure core + thin server bridge:

- `extractOutcomes(apps)`, from `applications.stage_history`: an application is a **win**
  if it ever reached `screening|interviewing|onsite|offer`; a **loss** if `rejected`
  (or `withdrawn` after `applied`) without reaching a screen. In-flight (`applied`,
  no verdict yet) is **excluded:** silence is not a loss yet.
- `learnLifts(outcomes, roleFeatures)`, per feature (role `archetype` + top `keywords`,
  bounded): wins/n vs the user's base rate, shrunk toward 0 with a small-n prior
  (`lift = (wins − n·base) / (n + K)`, K=2). Features with n<2 contribute nothing.
- `adjustFit(baseFit, features, lifts)`, sum of matching feature lifts, clamped to ±8
  fit points, with `because: [{feature, wins, n}]` for the UI. Never crosses 0/100.
- `calibrateScores(scoreEvents, outcomes)`, X3's `decision_events` (kind `app_score`)
  joined to outcomes by role: per likelihood bucket {n, wins}. Rendered only when n≥1,
  always with n.

**Surfaces (server-rendered, no client JS needed):**
- `/roles` workspace + `/feed` match cards: adjusted fit + a small chip
  (`+4 · your track record`) with the because-list in the existing detail area. Base fit
  stays visible (e.g. `72 → 76`).
- `/apply/[id]` score card: one calibration line under X3's score
  ("Your past 'high' scores converted 3/4, small sample, read gently.").

## Data / sources

First-party rows the caller owns, all existing: `applications` (stage_history),
`matches` (fit_score), `roles` (archetype, keywords), `decision_events` (kind
`app_score` from X3). **No migration; no new tables; no model calls.**

## Guardrails

- **Honesty first:** every adjustment shows its arithmetic (wins/n per feature); tiny
  samples shrink toward zero; the raw model fit is never overwritten or hidden.
- **Wellbeing:** losses lower fit on *similar future roles*, never produce guilt copy;
  in-flight applications are never counted against the user.
- **Bounded:** ±8 fit points max; features capped (≤6 keywords/role); queries bounded.
- **RLS:** every read is the caller's own rows; nothing new is writable.

## Acceptance criteria

1. A user whose funnel shows wins clustered in a feature sees adjusted fit (+chip with
   wins/n) on matching roles in `/roles` and `/feed`; roles without evidence show no chip.
2. Adjustment is bounded (±8), never flips a stored recommendation, and base fit remains
   visible; with no outcomes at all, pages render exactly as before (no chip, no error).
3. The apply-score card shows a calibration line for the user's own past scores with n;
   with no scored history it shows nothing (no fabricated stats).
4. All logic is pure-unit-tested (wins/losses/in-flight exclusion, shrinkage, clamps,
   empty states); request-level live E2E seeds outcomes and asserts the rendered chip +
   calibration line; cross-user RLS probe confirms user B's outcomes never touch user A's
   fit.
5. Full suite green; vitest + E2E + scenario counts strictly increase.

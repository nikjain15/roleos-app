# X3 — Pre-send application quality score (PRD)

## Problem

Users hit "Apply" blind. They can't tell whether this application — the tailored résumé against
this role's must-haves — is a strong submission or a coin-flip, and RO says nothing until the
funnel silently answers weeks later. Weak spots that are FIXABLE in two minutes (a missing
keyword, an unaddressed must-have, a generic summary) ship unfixed.

## Goals

1. Before sending, the user sees an honest **screen-likelihood score** for THIS application
   (approved résumé × this role), with **concrete weak spots and the fix for each**.
2. Every score is **persisted** so real outcomes can calibrate it later (X4's input): score at
   send time + the eventual stage reached = the learning pair.
3. Human-gated and cost-bounded: scoring runs only on the user's click, is rate-limited, and
   never blocks applying (a low score warns, never forbids — the user decides).

## Non-goals

- Predicting offers or comp (screen-stage only — that's where the résumé acts).
- Auto-fixing the résumé (the fixes link back to the editor; edits stay human).
- Outcome-driven recalibration of the score itself (X4, needs this slice's data first).
- Scoring unapproved drafts (the gate already covers truth/quality there).

## Approach

- **Skill `app_score`** (registry job `reason` — judging wants the strongest tier; structured,
  full gate, `expects` on shape): input = role (must_haves, nice_to_haves, title/company),
  the APPROVED résumé content, and the stored match rationale (fit + gaps). Output:
  `{score: 0-100, screen_likelihood: "low"|"medium"|"high", strengths: string[≤4],
  weak_spots: [{issue, fix}] (≤5), note}` — grounded ONLY in the provided inputs.
- **`POST /api/apply-score` {artifactId}** — auth → per-user rate limit (8/h, `rate_events`,
  already-applied table) → artifact must be the caller's own APPROVED résumé → run skill →
  metered via `logAgentRuns` → persist:
  - `artifacts.provenance.app_score` (jsonb — the latest score rides the artifact; no migration);
  - append-only `decision_events` (kind `app_score`, action `view`, payload {role_id, score,
    likelihood}) — the calibration substrate X4 will join against `applications.stage_history`.
- **UI** — `/apply/[id]` gains a "How strong is this application?" card: score badge +
  likelihood, strengths, weak spots with fixes, "Open the editor to fix" link, re-score button.
  Last score renders from provenance on reload. Copy is candid, never gatekeeping.

## Data / sources

Role must-haves (already extracted), approved résumé content, stored match reasoning/gaps —
all first-party rows the caller owns. No external calls beyond the metered model.

## Guardrails

Human-gated (click-to-score, never auto); no transport; truth posture: the score is RO's
calibrated OPINION, labelled as such; low score never blocks `/api/apply`; rate-limited;
every model call metered; RLS-scoped reads; zod on the route.

## Acceptance criteria

1. Signed-in user with an approved résumé clicks score → sees 0–100 + likelihood + ≥1 concrete
   weak spot with a fix (when any exists), within one request.
2. The score persists: reload shows the last score; a decision_event row exists with the payload.
3. Unapproved/foreign artifacts are rejected (409/404); unauth 401; junk body 400; >8 scores in
   an hour → 429 — all without model spend.
4. Applying remains possible regardless of score.

# X11 - Rejection → growth loop (PRD)

> Roadmap round 3 (approved via PR #42). Needs: X4 merged (the outcome model -
> `lib/outcome-learning.ts`: `learnLifts` / `adjustFit` / `roleFeatures`) and X3
> (score calibration in `provenance.app_score`) - both live. First commit of
> `v2/x11-rejection-growth`. **Spec-only: no build until approved.**

## Problem

A rejection today is a dead end: the user drags the card to "Rejected", an append-only
`reject` decision-event is written, and… nothing. No learning is captured, no perspective
is offered, and the moment lands as a quiet morale hit with zero forward motion. Two things
are being wasted at once: the user's resilience (rejection framed as verdict, not data) and
the product's own signal (the *reason* it fell through is never recorded, so the outcome
model can't sharpen). Best-in-world bar: the instant a rejection is logged, RO offers - never
forces - a calm two-minute reflection that says what the funnel data *actually* shows, names
one concrete adjustment, and captures a structured reason that makes the next match better.

## Goals

1. **Offered, never forced (`/reflect/[applicationId]`):** when an application moves to
   `rejected`, RO surfaces an *opt-in* "take two minutes?" entry - dismissible, no badge, no
   nag. Skipping costs nothing; the loop is entirely per-event and voluntary.
2. **Data, not verdict - grounded, zero invented consolation:** the reflection is built
   **deterministically** from real signals (no model call, so nothing is fabricated):
   - what the funnel says - from X4 `learnLifts`: how roles with this one's features have
     actually converted for *this* user, and which of the user's features are pulling weight;
   - calibration honesty - from X3 `provenance.app_score`: was the score high (a genuine near
     miss worth repeating) or low (expected - aim higher-fit next time)?
   - the plain base rate: senior searches are mostly no's; one rejection is one data point.
3. **One concrete adjustment:** exactly one, chosen deterministically from the lifts -
   targeting (lean toward the features that convert), résumé (a weak-but-fixable feature), or
   pace (if volume, not quality, is the gap). Never a scolding; always a next lever.
4. **Structured reason captured (no migration):** a short, optional picker - `no_response` ·
   `after_screen` · `after_interview` · `role_closed` · `not_a_fit` · `other` (+ free note) -
   written as a `reflection` `decision_event` (reusing the existing table/RLS). This is the
   signal the outcome model gains; capturing it is the product's half of the exchange.
5. **Wellbeing-first throughout:** acknowledge → truth → forward on every line
   ([[roleos-warm-copy-rule]]); rejection is never a failure verdict, the user's effort is
   named, and the exit is always one click. Engagement is never the goal - if the calm thing
   is to close the tab, the copy says so.

## Non-goals

- **No auto-anything and no outward action.** X11 reflects and records; it sends nothing,
  changes no other application, and never contacts anyone. Human-gated-outward is untouched.
- **No model call.** The reflection is deterministic over real data - this is a *feature*,
  not a limitation: a rejection is exactly the moment not to risk a hallucinated "silver
  lining". (If a future slice wants warmer prose, it's an explicit, separately-gated add.)
- **No forced flow, no streaks, no "reflections completed" metric.** Voluntary per event.
- No new migration (reason rides `decision_events`), no change to how `rejected` is set (the
  existing PATCH stays the single writer of the stage + `reject` event).

## Approach (reuse-first)

- **`lib/rejection-growth.ts` (pure, the testable core):** `buildReflection(app, role,
  lifts, appScore)` → `{ acknowledgment, dataPoints[], oneAdjustment, reasonOptions }`.
  Pure over already-loaded X4 lifts + X3 score + role features (`roleFeatures`/`featureLabel`);
  deterministic; no I/O. The adjustment selector is a small ranked rule set (strong-feature →
  targeting; weak-fixable feature → résumé; healthy quality + thin volume → pace). Includes a
  **safe floor**: with no outcome evidence yet, it still returns an honest base-rate
  reflection (never an empty or falsely-precise one).
- **`GET /reflect/[id]` (server page, RLS-scoped):** loads the rejected application + role,
  the user's `OutcomeLifts` (existing loader), the artifact's `app_score`; renders the
  reflection + reason picker. Redirects home if the app isn't the user's or isn't rejected.
- **`POST /api/reflection`:** validates (`zod`) `{ applicationId, reason, note? }`, confirms
  ownership + rejected stage, writes one `reflection` decision-event
  (`payload: { reason, note, role_id }`). Idempotent-ish: re-submitting updates the note, not
  a pile of events. No outward effect.
- **Entry points:** the tracker "Closed" column gets a quiet "Reflect (2 min) →" link on
  freshly-rejected cards; the PATCH→rejected response can deep-link the same. No push, no
  email - it waits for the user.

## Truth / wellbeing gates (must hold)

- Zero model calls → nothing invented; every claim traces to a real lift, a real score, or
  the stated base rate. If evidence is thin, the copy says "one data point", not a trend.
- Rejection framed as data, never as a verdict on the person; the user's effort acknowledged
  first; the exit is one click on every screen.
- RLS-scoped reads/writes; a reflection can only be written for one's own rejected app (live
  cross-user probe required).
- No engagement mechanics (no streak, no completion metric, no nag).

## Test plan (ratchet)

- **Unit (`lib/rejection-growth.ts`):** data points reflect the actual lifts (strong-feature
  surfaced; weak-feature named); adjustment selection for each branch (targeting / résumé /
  pace); high-score → "near miss" vs low-score → "aim higher-fit" calibration copy; **the
  no-evidence safe floor returns an honest base-rate reflection**; reason options are the
  fixed set; nothing in the output is a fabricated fact (structure assertions).
- **Live E2E:** offered-not-forced (rejected app shows the reflect entry; a non-rejected one
  does not); `/reflect/[id]` renders the grounded reflection + picker; **submitting a reason
  writes exactly one `reflection` decision-event and changes no application/stage and sends
  nothing**; re-submit updates rather than duplicates; cross-user RLS probe (can't reflect on
  someone else's app); non-owner / non-rejected → redirect.
- Ratchet vitest / live-E2E / public counts vs merged main in the AUDIT-LOG entry.

## Deferrals (called out, not silently cut)

- Feeding the captured `reason` back into `learnLifts` weighting (today it's recorded and
  visible to the model as an event; consuming it as a feature is a follow-up).
- Aggregate "what your rejections are telling you" across many events (this slice is
  per-event); a cross-rejection pattern view belongs with the weekly review (X7).
- Warmer generated prose - intentionally out (see non-goals).

## Open questions for approval

1. Reason taxonomy - is the six-option set above right, or do you want fewer/different
   buckets (e.g. split `after_interview` into phone-screen vs onsite)?
2. Should the reflect entry ever *auto-open* (e.g. a gentle inline card on the tracker) or
   stay a link the user chooses to click? (Lean: link only - most respectful of the moment.)
3. Retention: keep reflections indefinitely as model signal, or let the user delete a
   reflection (and its event) from the tracker?

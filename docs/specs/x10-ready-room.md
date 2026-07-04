# X10 — Ready-room: the morning ritual for the overnight queue (PRD)

> Roadmap round 3 (approved via PR #42). Needs: X1 (merged — the overnight hunt fills the
> queue this room drains). First commit of `v2/x10-ready-room`.

## Problem

X1 now works while the user sleeps: fresh roles matched, résumés pre-drafted and
truth-gated, queued in Tracker "Ready". But the morning after, the user faces a *board*,
not a *ritual*: each queued application means opening the tracker, then the artifact, then
the apply page — ~15 minutes of navigation per send, multiplied by the queue. The value of
the overnight work leaks away in friction. Best-in-world bar: wake up, open one screen,
make one honest decision at a time, and have the morning's applications out in minutes —
with every send still the user's own click.

## Goals

1. **One screen** (`/ready-room`): the queue of `ready`-stage applications (plus
   `drafting`-stage hunt drafts flagged `needs_your_eyes`), one card at a time — résumé
   summary + gate/truth status, X3 score if present, warm paths if present, the "why this
   role" rationale.
2. **One decision per card:** *Approve & apply* (approves the artifact, opens the existing
   human-gated Apply handoff) · *Needs work* (back to `drafting`, opens the editor) ·
   *Skip this one* (application → `withdrawn`, match preserved) — every action is the
   user's click and writes the same decision events the individual flows write.
3. **Momentum without pressure:** progress shown as "2 of 5 reviewed", never a countdown;
   leaving mid-queue loses nothing; an empty queue says what RO will do about it tonight.

## Non-goals

- **No batch-send and no auto-approve** — approving and sending remain per-item human
  clicks (human-gated-outward untouched; a "send all" button would gut the truth gate's
  point). No new send path: the room hands off to the existing `/apply/[id]` flow.
- No new drafting (the room reviews what exists; regeneration stays in the studio).
- No mobile-app push ("your queue is ready" rides the existing digest/notification rules).

## Approach (reuse-first)

- **`GET /ready-room` (server page):** applications at stage `ready` (or `drafting` with a
  hunt artifact), joined with their newest résumé artifact (content summary, provenance:
  gate status + truth flags + `app_score`), role (company/title/why from matches), warm
  paths (X6 lib), ordered oldest-first (FIFO — no cherry-picking anxiety). Bounded.
- **`ReadyRoom` client component:** card stack, keyboard shortcuts (A approve · E edit ·
  S skip · arrows), aria-live progress. Actions call EXISTING routes: artifact approve
  (same as ArtifactActions), `PATCH /api/applications` stage moves, then `router.push` to
  `/apply/[id]` for the send moment. One tiny new route only if an existing one can't
  express "approve + advance" atomically — prefer none.
- **Entry points:** feed card when the queue is non-empty ("Your overnight queue: 3 ready
  for review") and a Tracker header link. The X1 notification deep-links here.
- **Wellbeing copy:** review is invited, not demanded; skips are respected ("skipped — I
  won't re-draft this one unless you ask").

## Data / sources

Existing tables only (`applications`, `artifacts`, `matches`, `roles`, `connections`,
`decision_events`). **No migration expected.** No model calls in the room itself.

## Guardrails

Human-gated outward (approve + send are separate per-item clicks; no batch transport);
truth flags always shown before approve is possible on a flagged draft; RLS-scoped reads;
zod on any new route; a11y (keyboard-first is a feature, not an afterthought; 375px);
every empty/error state has a way forward.

## Acceptance criteria

1. A user with N queued hunt drafts reviews all N from one screen; each approve lands them
   on the existing Apply page with the bundle ready; the funnel records the same events as
   the long path.
2. A flagged (`needs_your_eyes`) draft shows its truth flags in the card and cannot be
   approved without opening the editor (Needs work) — never silently approvable.
3. Skip moves the application to `withdrawn` without touching the match or artifact;
   re-queue is possible from the tracker.
4. Empty queue → honest state ("nothing queued — here's what I'll hunt tonight") with a
   link to the hunt toggle; mid-queue exit preserves position semantics (FIFO re-entry).
5. Keyboard-only pass completes a full review; axe-clean at 375px.
6. Full suite green; vitest + live E2E + scenario counts strictly increase (happy path,
   flagged-draft block, skip semantics, empty state, RLS probe, keyboard/a11y).

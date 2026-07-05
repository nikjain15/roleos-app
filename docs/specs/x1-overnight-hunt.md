# X1 — Overnight autonomous hunt (PRD)

> Roadmap-v2 Phase X, slice X1. Needs: H1 (merged). One page: problem → approach →
> guardrails → acceptance. First commit of `v2/x1-overnight-hunt`; build follows.

## Problem

RoleOS only works while the user is looking at it. Fresh roles land hourly (ingest cron),
but a candidate has to open the app, refresh matches, pick a role, and click "tailor"
before anything moves. The highest-leverage hours of a job hunt — overnight, between
sessions — are dead time. Best-in-world bar: the candidate wakes up to *work already
done*: fresh goal-matched roles found, résumés pre-drafted and truth-gated, queued for
one review-and-click send.

## Goals

1. Nightly, per user: source fresh goal-matched roles (re-match against the live corpus).
2. Pre-draft résumés for the top NEW pursue-grade matches (full quality gate, truth gate).
3. Queue them in the Tracker: gate-passed → stage `ready` ("Send it"); gate-flagged →
   stage `drafting` ("resolve flags"). Artifact linked either way.
4. Tell the user calmly (digest-tier notification, never a push storm, never guilt).
5. User control: a visible pause/resume toggle; hunting respects it immediately.

## Non-goals

- **No sending.** The hunt drafts and queues; `/api/apply` (a human click) stays the only
  outward path. The human-gated-outward invariant is untouched.
- No new sourcing (uses the corpus the hourly ingest already maintains), no cover letters
  (W2 already drafts them on demand at Apply), no per-user Durable Object (cron stays the
  two-way-door scheduler per architecture §1.2), no email (H2's flag handles delivery).

## Approach (reuse-first)

New nightly trigger in the existing dedicated cron worker (`cron/worker.ts`,
`30 2 * * *` UTC) → `POST /api/cron/hunt` (new, secret-gated like digests/nudges/ingest).

Per eligible user — active goal + usable `master_profile`, not paused, throttled to one
hunt per 20h via `profiles.ambient.last_hunt_at`:

1. `recomputeMatchesForUser` (exists) — fresh, goal-aimed matches; user decisions preserved.
2. Select top fresh candidates: `recommendation='pursue'`, `status='new'`, highest fit,
   role not already in `applications`, no existing résumé artifact for that role.
3. For each (≤2/user/night): run `draft_resume` through the FULL quality gate (same path
   as `/api/tailor`), persist the artifact, meter every model call to `agent_runs`.
4. Insert the `applications` row (service-role; `stage_history`, derived `next_action`,
   `artifact_ids=[artifact]`), append a `decision_events` row (kind `hunt`, action `edit`).
5. One summary notification through `decideNotification` — kind `draft_ready`,
   not time-sensitive ⇒ digest/in-feed tier by default. Quiet hours + caps respected.

**Pause toggle:** `profiles.ambient.hunt_paused` (jsonb, no migration), surfaced on
`/tracker` ("RO hunts overnight while you sleep"), flipped via a small authed zod route.

## Data / sources

Existing tables only: `roles` (ingest keeps fresh), `matches`, `artifacts`,
`applications`, `notifications`, `agent_runs`, `profiles.ambient`. **No migration.**
Deploy note: cron worker redeploy on merge (`npx wrangler deploy -c cron/wrangler.jsonc`).

## Guardrails

- **Human-gated outward:** drafts only; no transport, no `/api/dispatch` import; invariant
  tests + dependency-cruiser stay green.
- **Truth gate on every draft** — flagged drafts land as `needs_your_eyes`/`drafting`,
  never silently "ready".
- **Cost:** run skips entirely when `budgetLevel` = `exceeded` (H5); caps: ≤8 users/run,
  ≤2 drafts/user, ≤8 drafts/run, ~240s soft deadline (dropped users logged, next night
  catches them). Worst case ≈ 8 gated drafts/night — inside the daily budget.
- **Wellbeing:** notification is `draft_ready` (value delivered), digest-tier; the engine's
  banned-kinds/caps/quiet-hours apply; a paused user is never contacted by the hunt.
- **Dormancy:** users with no `decision_events` in 30 days are skipped (no spend, no noise
  for someone who walked away).

## Acceptance criteria

1. `/api/cron/hunt` 403s without the secret; with it, processes eligible users within caps.
2. An eligible user with fresh pursue matches gets ≤2 truth-gated résumé drafts queued in
   Tracker — `ready` when the gate passed, `drafting` + flags when not — artifact linked,
   `next_action` set, metered runs in `agent_runs`.
3. Idempotent: second run within 20h no-ops for that user; tracked roles and roles with an
   existing résumé artifact are never re-drafted; `(user, role)` uniqueness respected.
4. Pause toggle on `/tracker` flips `ambient.hunt_paused`; a paused user is skipped.
5. Exactly one digest-tier `draft_ready` notification per productive hunt night.
6. Cost-budget `exceeded` ⇒ the whole run no-ops (logged).
7. Full suite green; test count + scenario count strictly increase; invariants untouched.

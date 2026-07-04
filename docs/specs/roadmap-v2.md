# Roadmap v2 — wrap-up, hardening & next-level

> The v1 build board (slices T + 1–11) is **complete, merged, and live** on `ro.roleos.fyi`.
> This is the v2 board the autonomous loop works next. Same machinery: `docs/BUILD-LOOP.md`
> (process + parallel rules), `docs/AUDIT-DIMENSIONS.md` (10-dim gate), `docs/AUDIT-LOG.md`
> (living learnings). **One PR per slice; a slice is READY only when its "needs" are merged.**

## Advanced slices are spec-then-build

Every **Phase X** slice starts by writing a **1-page PRD** (`docs/specs/x<n>-*.md`) as the
first commit of its branch, *then* builds it. The human reviews the design at PR time — that's
how product direction stays steerable without blocking the loop.

## Phase W — Wrap-up (finish the v1 deferrals)

| Slice | Name | Needs | Parallel-safe |
|---|---|---|---|
| W1 | Fit-on-browse — fit badge on every role in `/explore` (roles-workspace P0-7 / Phase B) | — | W2–W7 |
| W2 | Drafted cover letters — real, truth-gated, per role (replaces the template in Apply) | — | W1,W3–W7 |
| W3 | RO-dock act-verbs — draft / filter-this-view / tailor **in place** (still human-gated, no transport) | — | others |
| W4 | Roles workspace P1 — compare 2–3 · per-role notes · bulk dismiss | — | others |
| W5 | Tracker depth — tracker↔résumé/artifact linking in UI · richer `next_action` automation · timeline view · per-stage SLAs | — | others |
| W6 | Persist anon Explore conversation across page loads | — | others |
| W7 | Goal switching UI + "also open to" deeper wiring (multi-goal-lite) | — | others |

## Phase H — Go-live hardening (code we can own now)

| Slice | Name | Needs | Notes |
|---|---|---|---|
| H1 | Observability + error tracking — structured logging, `/api/health`, error boundary, Workers analytics surfaced in `/admin` | — | no paid dep; use Workers observability |
| H2 | Email/push delivery **wired behind a flag** — activates when Cloudflare Email is enabled; no-op + in-app until then | — | code ready, **human flips CF Email** (hard-stop) |
| H3 | Rate-limiting + abuse guards on all public/AI routes (extend the index ask-rate pattern) | — | cost/abuse guard |
| H4 | Security pass — CSP + security headers, `npm audit` gate in CI, input-validation sweep (zod on any un-validated route) | — | + secret-rotation runbook (rotation itself = human hard-stop) |
| H5 | Performance/scale pass — query indexes, pagination caps, caching, `agent_runs` cost-budget alerting | — | keeps it fast at scale |

## Phase X — Next-level / advanced (spec-then-build)

| Slice | Name | Needs | Notes |
|---|---|---|---|
| X1 | **Overnight autonomous hunt** — per-user scheduled agent sources fresh goal-matched roles nightly, pre-drafts résumés for top pursues, queues them in Tracker "Ready" for one-click send | H1 | reuses Workflow/cron; **still human-gated send** |
| X2 | **Company & interviewer research briefs** — public-data brief before you apply/interview (company: funding/news/product/culture; interviewer: public background) | — | ToS-safe sources only; spec the sources |
| X3 | **Pre-send application quality score** — predict screen-likelihood, flag weak spots + fixes before you send; feeds funnel calibration | — | closed-loop with the pace engine |
| X4 | **Outcome-learning fit model** — real outcomes (screen/reject/offer) update role recommendations + fit scoring over the 15 dims + funnel | X3 | makes RO smarter with every result |
| X5 | **Comp intelligence + offer decision co-pilot** — real comp benchmarks per role/level/geo feeding negotiation; multi-offer comparison on weighted priorities | — | spec the comp data source |
| X6 | **Referral & warm-intro finder** — surface likely warm paths into target companies + draft intro asks | — | **human approval** (ToS/data source); spec first |
| X7 | **Weekly strategy review** — candid, wellbeing-aware weekly review: pace, what's working, recommended pivots, next-week focus | — | reuses digest + plan |
| X8 | **Voice mock interviews** — talk to RO for realistic mocks with adaptive follow-ups + debrief | — | **likely paid voice infra → hard-stop for approval**; spec + cost first |

## Human go-live actions (NOT loop slices — hard-stops the loop prepares but you execute)

- **Cloudflare Email** enablement (unblocks H2 email/push delivery).
- **Google app verification** (opens Gmail/Calendar beyond test users).
- **Production SMTP** for magic links (Supabase default rate-limits at scale).
- **Secret rotation** (keys shared in chat historically).
- **Paid CF Containers** (live prototype preview) + any paid infra an X-slice needs.

The loop writes the code/flags/checklists for these and **stops** for you to flip the switch.

## Suggested order

Wrap-up (W1–W7, highly parallel) → Hardening (H1,H3,H4,H5; H2 waits on CF Email) →
Advanced (X-slices, spec-then-build; X1/X3 first for the biggest leverage). Keep one PR per
slice, every D1–D10 dimension green, guardrails never regressed.

## Round 3 — proposed by the loop (step I, 2026-07-04) — needs your merge to become READY

> Phases W/H/X above are fully built (merged or queued as CI-green PRs). Per the loop's
> "raise the bar" step, these are the next highest-leverage slices toward the North Star —
> land the target role FASTER with LESS stress. Same rules: spec-then-build (PRD is the
> first commit), one PR per slice. Merging THIS section is your approval to build them.

| Slice | Name | Needs | Why it's next (North-Star leverage) |
|---|---|---|---|
| X9 | **Reply desk — scheduling + follow-up autopilot (drafts only)** | — | The funnel's biggest silent-drop zone is AFTER a recruiter replies: slow scheduling and missed follow-ups kill live threads. Gate-2 Gmail/Calendar integration + `lib/followups` + the SLA engine already exist — X9 detects a reply that needs scheduling, proposes real calendar slots, and queues drafted replies/thank-yous/follow-ups in a "reply desk" — every send human-clicked, as always. |
| X10 | **Ready-room — batch review for the overnight queue** | X1 merged | X1 fills Tracker "Ready" while the user sleeps; X10 makes the morning ritual: one screen to review→edit→approve→send the queued drafts (score, cover, warm path inline), one decision at a time. Cuts per-application friction from ~15 min to ~2; the send stays per-item and human. |
| X11 | **Rejection→growth loop** | X4 merged | Rejections are today a dead end (stage change, nothing learned, morale hit). X11: on a rejection, RO offers a calm 2-minute post-mortem — what the funnel data actually says (X4 lifts + X3 calibration), one concrete adjustment (targeting/résumé/pace), structured reason captured to sharpen the outcome model. Wellbeing-first: rejection framed as data, never verdict; entirely opt-in per event. |
| T2 | **Test-debt: OTP-budget-aware live harness** | — | The live suite seeds 40+ throwaway users per run and now exhausts Supabase's ~30-per-5-min OTP-verification budget mid-run (found in X1; every slice since runs the suite in hand-rolled chunks). T2: pool + reuse seeded users across specs (fixture-level), single-session per worker, and a budget-aware runner — full suite back to ONE green command. Pays for itself every future slice. |

Suggested order: **T2 first** (every later slice's gate gets faster/safer), then X10 → X9 → X11.

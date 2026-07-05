# Design PRD — CORE · Interview prep: research briefs (the dossier with a calm face)

> Status: **APPROVED design → READY to build** (human approved 2026-07-05, design-depth loop).
> Source of truth: **https://roleos.fyi/proto/research-briefs/** (4 personas) · decisions:
> https://roleos.fyi/proto/research-briefs/decisions.html · **EXTENDS X2** (corpus brief =
> fallback; §4 is the one new infrastructure capability).

## 1 · Intent (human-signed)

Turn the night-before hour of panicked googling into a two-minute read with an iceberg under
it. Dossier: her short version on top (what they hire for · what they'll probe YOU on · your
best questions · honest comp note); full sections open one at a time. Ask-anything bar: name
a source or she picks and says why; answers land in the dossier permanently, receipts
attached. Interviewers: **public-professional only + user uploads** (THE decision X2
deferred, now made): published talks/posts/papers/company bio, framed as "what they care
about professionally"; NO LinkedIn scraping (X6 ruling holds); user-pasted context
(recruiter emails, friends' tips) folded in consent-cleanly; low-profile people get honesty
+ labeled role-based inference, never invention. Receipts load-bearing; "what I don't know"
out loud. Delivery: T-24h full brief with the prep, 30-second morning refresher, on-demand
always.

## 2 · Behavior spec — per the prototype

Layered dossier (calm-UX: one section at a time) · thin-company degradation (honest, ask-bar
as the path deeper) · ask flow (source choice → provenance-carrying answer → persisted) ·
interviewer cards (published/low-profile registers; per-interview person-research opt-out,
Settings global later) · upload fold-in visibly changes prep · refresher ("three things
walking in") calendar-aware or tracker-stage-triggered.

## 3 · Data & guardrails

All claims trace to sources (corpus rows, fetched pages, or user uploads — labeled).
Uploads RLS-scoped + deletable. Person research: allowlisted public-professional source
types only; opt-out honored; no person data persisted beyond the brief. Verified-before-
shown + "not right?" (J8) apply. Warm-copy bar.

## 4 · Infrastructure flag — live external research

X2 is corpus-only. Dossier depth + ask-bar require **flag-gated live fetching**: egress
allowlist + source-type review (the roadmap's anticipated v2), fetch costs metered, every
answer with provenance. Corpus brief is the graceful fallback until the human flips the
flag (hard-stop consistent with the go-live actions list).

## 5 · Acceptance criteria

1. Dossier renders per proto (both company registers) at 375/768/1280, axe-clean; sections
   accordion one-at-a-time; receipts tap-to-source; unknowns section always present.
2. Ask flow: source-choice → answer with provenance → persisted in dossier; corpus-only
   fallback path when flag off (honest "I can't fetch live yet" copy).
3. Interviewer cards: published + low-profile registers; upload fold-in updates prep
   artifacts; per-interview opt-out; no non-allowlisted source can enter a person card (test).
4. Delivery: T-24h assembly with prep; morning refresher generated from the brief; tracker-
   stage trigger without calendar.
5. **Tests (ratchet):** unit: source-labeling; opt-out; refresher derivation. E2E: all four
   personas; ask flow both source paths; upload fold-in. Invariants green.

## 6 · Non-goals

Mock/practice (J12 next) · comp benchmarks beyond stated (X5) · referral pathfinding (13) ·
scraping anything a person didn't publish.

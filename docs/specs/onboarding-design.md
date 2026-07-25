# Design PRD - Onboarding v2 (value-first, taste-from-minute-one)

> Status: **APPROVED design → READY to build** (human approved 2026-07-04, design-depth loop).
> Visual + microcopy source of truth: **https://roleos.fyi/proto/onboarding/** (clickable, all
> personas via debug bar) · decisions log: https://roleos.fyi/proto/onboarding/decisions.html
> Replaces/deepens the live `app/(app)/onboarding/page.tsx` flow - an upgrade, not a rewrite.

## 1 · Problem & goal

The live onboarding proves RO works before signup, but it teaches nothing about the user
(mirror is static text), asks for nothing beyond the profile, and hands off to the feed
coldly. Goal: convert a skeptical senior candidate from "another AI job tool" to "an agent
just did real work for me" in under a minute, **and fire the first taste-model signals
before signup**. North-star metrics: time-to-first-value (arrival → mirror on screen) and
post-matches save rate. Explicitly NOT top-of-funnel signup rate.

## 2 · Confirmed intent (human-signed, 2026-07-04)

One input (LinkedIn / paste / CV, plus an optional one-line target) → an honest plain-English
ticker of RO actually working → one combined screen: her tappable read of you (statements +
target-guess + one insight, as bold as evidence allows) beside jobs that stream in and visibly
re-rank when you correct her → a save-framed signup with a real taste of the work → a first
feed minute where RO narrates next moves, asks for a goal, matches beneath. Every dead end
(thin, junk, weak pool, returning) gets an honest scripted recovery in her voice - she never
fakes value.

## 3 · Flow map

```
 arrive (4 variants) ──► working ticker ──► combined read+jobs ──► save ──► sign in ──► feed first-minute
   │  default · explore ·      │ junk → honest stop (no results, back)      (existing     │ RO narrates → goal
   │  ret-anon · ret-empty     │ thin → ask exactly 2 things → results       passwordless) │ seam card → matches
   └─ signed-in w/ saved work ─────────────────────────────────────────────────────────► /feed (never re-onboard)
```

## 4 · Screen-by-screen (behavior; copy verbatim from the prototype)

**S1 · Arrive** (`/onboarding`, entry variants by context)
- Three self-explaining input options, each with its "why" line (LinkedIn = whole career;
  CV = every bullet, parsed on-device; free text = she asks for what's missing) + optional
  skippable target question ("What job do you want next?").
- **Sharpness meter**: fills as inputs are given (1 bar empty → 3 with profile → 4 with
  target). Motivates detail; never blocks.
- Variants: (a) default; (b) **Explore arrival** (`?from=role:<id>`): RO opens by continuing
  the conversation ("You were looking at the Stripe role…"), why-lines and target question
  become context-aware, the source role is guaranteed a verdict in results, tagged; (c)
  returning anon: remembered LinkedIn URL prefilled + "re-pull?"; (d) signed-in-no-data:
  "signing in told me who you are, not what you've built". Signed-in WITH saved matches →
  redirect `/feed` (keep current behavior).

**S2 · Working ticker**
- Only true pipeline steps, in plain English - rule: every line passes "would a non-tech
  friend understand this?" No jargon ("embeddings", "reranking" banned), no fake steps.
- **Junk input** → honest stop, RO's junk line, no results path. **Thin input** → RO asks
  for exactly two things (target role + one thing built), inline, then proceeds.

**S3+4 · Combined read & jobs** (one screen, two zones; stacked on mobile, read on top)
- Left: 4–5 mirror statements + the **target-guess statement** (visually distinct) + ONE
  insight. Every statement tappable: ✓ (confirm) / ✗ (correct: free text on statements,
  choice chips on the guess). Insight = **bold with receipts** when evidence allows (comp
  claim + "I compared N postings; estimate, not a promise"), **fallback** sharp-safe
  observation on thin evidence. Language must follow the confidence ladder.
- Right: matches stream in (first 2 fast, "still comparing N more…" skeleton, rest follow).
  Verdict words are human ("go for it / maybe / skip"). Each carries the why + comp when
  stated. Nudge card: "ranked against my guess - tell me the real thing and I'll re-rank."
- **Correction payoff**: any correction of the guess (chip or nudge input) visibly re-ranks
  the list with a one-line explanation of what moved and why. Latency decision: acknowledge
  instantly in-place, re-sort async when the model returns (no blocking spinner).
- **Weak pool**: mirror + insight still delivered; honest "nothing's a strong fit this
  week… widen or hold the bar? I'll keep watch" + adjacent maybes only. No padding, ever.

**S5 · Save**
- Leads with the **taste line**: one real resume bullet of theirs retold for their top match
  (⚑ cost flag §7). Then 3 plain cards (resume retold per match · cover letters drafted,
  you approve every send · week-by-week plan). Honest ephemerality: "leave without saving
  and this disappears - nothing is stored without your say-so." Weak-pool variant: the
  promise is watchfulness, not drafts.

**S6 · Sign in** - existing passwordless (Google + magic link), copy per prototype ("Keep
what she found… no password, ever"). Pending-work handoff extended per §5.

**S7 · Feed first-minute** (feed top-state when arriving from onboarding save)
- Order: RO narrates what she's doing next ("rewriting your resume for your top 3 - you
  don't need to do anything yet") → **goal seam card** ("tell me the job you want and by
  when - everything I do gets sharper" · 2 minutes · "not yet" dismisses gently) → saved
  matches → "what happens while you're away" reassurance card. Weak-pool variant: her first
  job is watching; no noise promise.

## 5 · Data requirements (the personalization contract)

1. **Pre-save privacy (non-negotiable):** anonymous sessions store nothing server-side.
2. **Save-payload completeness (NEW - required):** the signup handoff must carry ALL
   pre-save actions - every ✓/✗, every correction text/chip, the target answer, re-rank
   requests - not just profile/mirror/matches as today. On account creation each becomes a
   `decision_events` row (corrections at high weight) so the taste model's first entries
   are the corrections made before signup.
3. **Capture everything after save:** every onboarding interaction is a decision event
   feeding `taste_model` projections (existing 15-dim loop). Per-user only (RLS),
   exportable/deletable; product-level learning stays anonymized/aggregate.
4. Target answer (S1 optional question or guess-correction) seeds the future Goal draft.

## 6 · Guardrails (unchanged, re-asserted)

Human-gated outward untouched (nothing here sends). Truth gate: insight/mirror claims trace
to profile + corpus evidence with calibrated language; no invented comp numbers - stated
ranges vs estimates always labeled. No engagement bait anywhere (incl. the ephemerality note:
factual, no countdown/urgency theater). `decision_events` append-only. RLS on all new
reads/writes. `zod` on any new/changed route input.

## 7 · Flags for the builder / human (decide at build time, PRD default given)

- **Taste line cost**: one `draft`-tier call per anon user reaching S5. Default: ship it
  behind a flag, ON; measure save-rate lift vs a canned example.
- **Re-rank latency**: default instant-acknowledge + async re-sort (no blocking).
- **Insight anchor**: default money-when-provable (stated/estimated comp evidence), else
  trajectory/positioning fallback. Never a bare unsupported number.
- **Anon LinkedIn pull budget**: rate limits exist (H3); free-pull policy = human call.

## 8 · Acceptance criteria (Definition of Done)

1. All S1–S7 behaviors above live at 375/768/1280, axe 0 serious/critical, in RO's voice
   (copy lifted from the prototype, ship-checklist pass).
2. Save round-trip: pre-save reactions/corrections/target reach `decision_events` on first
   auth (verify rows + weights), and taste/matching visibly consume them (re-rank on
   correction works end-to-end).
3. Recoveries: thin, junk, weak-pool, and all three returning-user variants reachable and
   correct (junk NEVER yields matches).
4. Explore arrival: `?from=role:<id>` variant renders context copy + guaranteed verdict.
5. **Tests (ratchet - net-new, all green):** unit: save-payload mapper → decision_events
   (incl. weights, idempotency on retry); ticker copy passes a jargon blocklist; E2E:
   full happy path incl. tappable mirror + re-rank; junk recovery; explore param; pending
   handoff through login. Existing invariant/guardrail suites stay green (no-send-tool,
   RLS, append-only).
6. `agent_runs` metering covers any new model calls (mirror unchanged, taste line, re-rank).

## 9 · Non-goals

Goal Setter screens (own slice, next design), email capture pre-save, native mobile,
new CV file formats, LinkedIn re-pull pricing policy (business), Explore's own chat context
model (only the arrival variant ships here).

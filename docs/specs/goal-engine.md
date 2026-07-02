# Functional Spec — the Goal Engine ("get X in Y days")

> Status: **DRAFT for alignment** · Owner: Nik · The spine that makes the 14 screens
> a *product*, not a toolbox. Read with the full-product wireframes.

## The promise (and the honest version of it)

**You tell RoleOS a goal — "a Senior AI PM offer at a Series-B+ company in 60 days" —
and it runs the hunt to get you there.** It sources the roles, scores your fit, crafts
the applications, gets them out (your click), tracks every conversation, and **adapts
the plan in real time** so you always know if you're on pace and what to do next.

The honest version, baked into the product: **RO can't guarantee a job.** It maximizes
your *probability* of hitting the goal in the window, and it is candid when the goal is
at risk or unrealistic — and exactly what would make it realistic (broaden, accelerate,
fix a weak spot, or extend the timeline). No false certainty, ever.

## 1 · The goal model

The user declares a **Goal** (new first-class object): 

```
Goal {
  target:      { archetype, seniority, comp_floor, company_type, location/remote }
  deadline:    Y days  (→ target_date)
  constraints: visa, must-haves, dealbreakers
  intensity:   how hard they want to push (hours/week, apps/week ceiling)
}
```

Captured in a short **Goal Setter** flow (extends onboarding). Everything downstream —
sourcing, ranking, pace, agenda — is computed *relative to this goal*. Change the goal,
the whole plan recomputes.

## 2 · The engine — one closed loop

```
   SET GOAL ─▶ PLAN (pace/funnel) ─▶ SOURCE & MATCH ─▶ CRAFT ─▶ APPLY ─▶ ADVANCE ─▶ TRACK
      ▲                                                                                │
      └──────────────────  ADAPT  ◀── measure actual vs plan ◀───────────────────────┘
```

Every stage already maps to a screen; the engine is what connects them and keeps them
pointed at the deadline.

| Step | What it does | Autonomy |
|---|---|---|
| **Set goal** | Capture X + Y + constraints → a Goal object | you |
| **Plan** | Compute the funnel + weekly pace + milestones to hit Y (see §3) | RO |
| **Source & match** | Ingestion keeps finding goal-matching roles; matcher scores fit; workspace prioritizes | RO (background) |
| **Craft** | Per pursued role: tailored résumé, proof piece, screening answers — truth-gated | RO drafts |
| **Apply** | Compose + send | **you send** |
| **Advance** | Recruiter replies, interview prep, negotiation | RO drafts, you send |
| **Track** | Every application's real stage + timeline = source of truth for progress | RO maintains |
| **Adapt** | Compare actual funnel vs plan → adjust targets/pace/craft, or reset expectations | RO proposes, you approve |

## 3 · The Plan & Pace engine (the new core)

This is what turns "60 days" into a concrete daily reality.

**Backward funnel.** From benchmark + your own accruing conversion rates, RO computes what
it takes to land one offer by the deadline:

```
1 offer  ⇐  ~3–5 final rounds  ⇐  ~8–12 first interviews  ⇐  ~25–40 targeted applications
```

(seed numbers from senior-PM benchmarks; **recalibrated to *your* real rates** as data
arrives — dimension 14.)

**Pace.** Given Y days minus interview/offer lead time, RO derives the **weekly targets**:
roles to add to pipeline, applications to send, prep sessions — and whether that pace is
**feasible** given (a) supply of matching roles and (b) your stated intensity.

**Milestones.** e.g. Day 7: shortlist of 15 built · Day 14: first 10 applications out ·
Day 30: first interviews · Day 45: onsites · Day 60: offer/decision.

**On-pace status.** A single always-visible signal: **On track / At risk / Off track**,
with the one lever that most improves it.

## 4 · The Daily Agenda (you always know the next move)

The Feed cockpit leads with **"Today"** — the shortest list of actions that keeps you on
pace, ranked by impact toward the goal:

> **Today · to stay on track for Day 60**
> 1. Review + send 3 ready applications *(you're 2 behind this week's pace)*
> 2. Prep for the Stripe screen (Thu) — RO drafted your story map
> 3. Approve the Ramp résumé draft — unblocks that application

No dumping everything. The agenda is derived from the plan + tracker state, so it's always
"what moves the goal," not "everything that exists."

## 5 · What each module actually does (inputs → outputs)

- **Sourcing** — continuously fetches open roles from ATS boards filtered to the goal;
  dedupes, embeds, extracts structured requirements. *Out: fresh goal-matching roles.*
- **Match / Workspace** — scores fit (pgvector recall → Opus reasoning), gives calibrated
  pursue/maybe/skip + why + gaps; you sort/filter/save/dismiss; live re-rank. *Out: a
  prioritized shortlist sized to the plan.*
- **Résumé** — reworks your real profile to a role, truth-gated, editable, exportable.
  *Out: an ATS-ready, honest résumé per role.*
- **Build Studio** — co-creates a proof piece (PRD / case study / prototype) with an
  authenticity gate. *Out: a portfolio artifact that differentiates you.*
- **Coach** — predicts questions, runs adaptive mocks, honest debrief. *Out: interview
  readiness + the specific gaps to close.*
- **Apply / Send** — bundles résumé + note + screening answers, opens the pre-filled ATS
  form or Gmail compose. *Out: a sent application (your click) → tracker advances.*
- **Recruiter Desk** — classifies inbox, drafts truth-gated screening answers + replies
  using real calendar availability. *Out: fast, accurate responses (you send).*
- **Negotiate** — benchmarks the offer, quantifies levers, drafts the counter. *Out: a
  better offer (you send).*
- **Tracker** — the funnel of record: each role's stage + timeline + next action; feeds
  the pace engine. *Out: real progress vs plan.*

## 6 · The adaptive loop (why it's a system, not a checklist)

Every few days (and on every stage change) RO compares **actual vs planned funnel** and acts:

- **Behind on applications?** → widen targets (more supply), raise weekly pace, or surface
  faster-to-apply roles.
- **Applying but no screens?** → the résumé/positioning is the bottleneck → RO proposes
  fixes and re-tailors.
- **Screening but no onsites?** → interview performance → Coach focuses there.
- **Timeline genuinely infeasible** given supply + conversion? → RO says so plainly and
  offers the trade-offs (extend to N days / broaden archetype / relax comp) with the
  resulting probability. **Candid, never cold.**

## 7 · The 15-dimension self-learning loop feeds all of it

Every decision (save, dismiss, edit, accept, reject, debrief) updates the taste model,
which sharpens: fit ranking (dims 1–4, 13), résumé voice + truthfulness bar (5–6), story
emphasis + keywords (7–8), outreach tone (9), cadence (10), interview focus (11),
negotiation posture (12), **and the funnel calibration itself (14)** — so the pace math
gets more accurate the longer you use it. Fully transparent + correctable (Settings).

## 8 · Guardrails (non-negotiable, enforced in code)

- **Human-gated outward** — RO drafts and prepares up to the send; **you send**, always.
- **Truth-gated** — no invented claims in any artifact; flagged to your eyes.
- **RLS** — your goal, pipeline, and profile are yours alone.
- **Wellbeing > engagement** — the pace pushes toward *your* goal, never toward time-in-app;
  no guilt, no streaks, honest odds.
- **Responsive + accessible** — every screen works on phone and desktop.

## 9 · "Fully functional" = definition of done

The product is done when a real user can: **state a goal → get a live plan with a pace →
see a prioritized shortlist → craft honest applications → send them → track them → and
watch RO adapt the plan as reality unfolds — end to end, on any device, with every
outward action gated by their click.** Each module above ships only when its
inputs→outputs work against real data and the guardrail tests stay green.

## Open questions

- **(product)** Do we let users run **multiple concurrent goals** (e.g. two archetypes), or
  one active goal at a time in v1? (Recommend: one active goal, switchable.)
- **(data)** Seed the funnel from public benchmarks until we have per-user rates — what
  source do we cite for senior-PM conversion baselines?
- **(product)** How hard should the pace nudge be when a user falls behind — informative
  only, or a gentle prompt? (Recommend: informative + one suggested action, never guilt.)

# Design PRD - Goal setup (the invitation, the proposal, the plan reveal)

> Status: **APPROVED design → READY to build** (human approved 2026-07-04, design-depth loop).
> Visual + microcopy source of truth: **https://roleos.fyi/proto/goal-setup/** (personas via
> debug bar) · decisions log: https://roleos.fyi/proto/goal-setup/decisions.html
> The goal ENGINE (funnel math w/ confidence intervals, pace, feasibility, adaptation,
> W7 switching) is already live - this slice redesigns the EXPERIENCE around it. Re-skin the
> moments; do not rebuild the math.

## 1 · Problem & goal

The Goal Setter exists (slice 2 + W7) but reads as a form and buries the engine's best
moment - the plan. Goal: make handing RO a target feel like an act of trust that pays back
immediately: she proposes what she's learned, asks only what she can't know, and reveals an
honest plan that lands on one doable number. Success: users can answer "what am I doing this
week and why" unaided; ≥50% of active users set a goal within a week of onboarding; no-goal
ambient mode remains legitimate (never forced, never nagged).

## 2 · Confirmed intent (human-signed, 2026-07-04)

Turn RO from "working ambiently" into "running a plan toward your date" - through an
invitation, never a gate. RO proposes the goal pre-filled from everything she's learned (the
user edits a nearly-done thing), then asks only what she can't know: the date, whether it's a
real wall or an ambition (inferred when possible, asked warmly when not), and how hard to
push (three modes with a live week preview; she recommends the sustainable one). The reveal:
honest backward math with ranges landing on one doable number over a soft-edged four-phase
road. Unrealistic goals get candor + levers at set-time, keepable eyes-open. Every input
feeds the taste model; everything recalculates on change.

## 3 · Flow map

```
feed invitation card ──► propose (she pre-fills, you edit) ──► date moment ──► push mode ──► plan reveal ──► goal lives in feed
  "not yet" = gentle,          every edit = decision event      infer-first;     3 modes,      funnel ranges → ONE      on-track / behind states,
  card returns quietly,                                         ask warmly if    live week     this-week number →       warm by deadline type,
  never a nag                                                   unknown          preview       soft-edged phase band    change-anything card
                                                   unrealistic goal? → candid levers BEFORE the plan (widen / extend / keep-and-sprint)
```

## 4 · Screen-by-screen (behavior; copy verbatim from the prototype)

**S1 · Invitation** - feed card, warm offer ("give me something to aim at… no rush - I'm
working either way"). "Not yet" dismisses gently; card returns after meaningful moments
(policy detail may land in the Nudges design; interim: reappear after first interview or
third application, never on a timer). Always reachable from the feed. Switcher variant:
"your old goal is safe and paused - nothing you built is lost."

**S2 · Propose-and-edit** - RO's pre-filled target (role / location+comp / company type)
from master profile + taste model; every field directly editable with visible focus glow and
an inline "Got it - updated…" acknowledgment. Every edit = a decision event. Date field
last ("we'll talk about what kind of date it is next").

**S3 · Date moment** - **infer first, ask warmly only if unknown.**
- Known (e.g. visa in profile): confirm with care, never re-quiz ("You mentioned your visa
  runs to September - so this date is a real one… you won't be doing it alone"), plus the
  what-I'll-do-differently card. One-tap "actually it's more of a target" correction.
- Unknown: warm ask ("is this something that breaks if we miss it - or a target you want?
  Either answer is a good answer"), each choice followed by its motivating reassurance line.
- Wall → plan front-loads; ONLY true cutoffs may cross quiet hours (gently). Ambition →
  steady pace, quiet hours absolute, date slides gracefully with zero guilt.

**S4 · Push mode** - Steady / Push / All-in cards with real translations (~4/8/15 apps/wk,
hours of user time) + live "your week with RO" preview per mode. RO recommends the
sustainable fit for the window and names what's good about the options she passes over.
Game-feel, NOT game mechanics - XP/streaks/badges remain banned. Mode switchable anytime;
plan recalculates; mode choice + switches are decision events.

**S5 · Plan reveal** - order matters:
1. Good-news framing ("this is very doable, and I can show you why").
2. The honest funnel with RANGES (25–40 → 8–12 → 3–5 → 1), never point estimates; ranges
   tighten as personal rates accrue (engine dim 14 - exists).
3. **One actionable number**: "This week it just means 6 - and I've already drafted 3."
4. The road: four soft-edged phase bands (ramp/push/interviews/close); ONLY the deadline is
   a hard mark; explicit "edges shift as reality comes in."
- **Unrealistic goal (feasibility gate says sprint):** the lever conversation comes FIRST,
  warmly ("I love the ambition - let's be smart about it together"): widen (+quantified odds),
  extend (comfortable), keep-and-sprint ("we'll both know we're sprinting - I'll watch your
  energy"). Never blocked, never blind; user-facing label is "we sprint, eyes open," not
  "at risk" scare copy. Lever choice = decision event.

**S6 · Living with it** - feed goal strip: goal + pace chip + one next action ("Week 1 of 9 ·
4 of 6 sent · next: review the Ramp draft (15 min)"). On-track: celebrate + permission to
rest ("Rest tonight; I'll have tomorrow's two ready"). Behind: warm by deadline type -
wall → urgency with a hand out ("Rough week - says nothing about you… one application
tonight would do it, I picked the easiest"); ambition → zero guilt, date slides. A
change-anything card: goal/date/mode/pause all editable, everything recalculates, old goals
stay saved.

## 5 · Voice bar (regression-tested, not aspirational)

Every line runs **acknowledge → truth → forward-with-belief**; copy check = "would the user
feel backed and capable after reading this?" Facts, odds, and honest feasibility stay -
delivery carries belief. This was explicit human feedback (early drafts read as rude);
microcopy in the prototype is the approved register. Recommendations must name what's good
about rejected options. Status labels point forward.

## 6 · Data & guardrails

- Decision events: proposal edits, wall/ambition answer, mode choice + every switch, lever
  picks, "not yet" dismissals (low weight). All feed taste + funnel calibration.
- Wellbeing: no streaks/XP/guilt; behind-on-ambition = zero-guilt + graceful slide; only a
  real wall's true cutoff crosses quiet hours; she recommends rest when ahead.
- Human-gated outward untouched. RLS on all reads/writes. `zod` on changed routes.
- Plan changes always proposed, never silently applied (engine rule - preserve).

## 7 · Acceptance criteria (Definition of Done)

1. S1–S6 live at 375/768/1280, axe 0 serious/critical; copy matches the prototype register
   (ship-checklist pass; no cold facts-first strings).
2. Infer-first date moment: with a wall signal in profile data she confirms instead of
   asking (both paths E2E-tested); wall vs ambition demonstrably changes pace shape
   (front-loaded vs even) and nudge copy.
3. Feasibility gate → lever conversation renders BEFORE the plan for infeasible windows;
   all three levers produce correct recalculated plans.
4. Mode preview updates live; switching mode later recalculates without data loss.
5. Plan reveal shows ranges + one this-week number + soft-edged phases; no dated milestones.
6. **Tests (ratchet - net-new, all green):** unit: deadline-type → pace-shape mapping;
   lever → plan recompute; decision-event writes for edits/mode/levers (weights). E2E: full
   happy path; sprint path with each lever; behind-state copy variants by deadline type.
   Existing invariant/guardrail suites stay green.

## 8 · Non-goals

Rebuilding plan/pace math (exists) · nudge cadence policy beyond the interim rule (Nudges &
digests feature) · concurrent multi-goal planning (deferred per goal-engine §B) · feed/cockpit
layout beyond the goal strip (next feature: Feed/cockpit).

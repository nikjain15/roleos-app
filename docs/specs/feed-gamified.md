# Feed — the gamified daily cockpit (design spec)

> Status: **direction approved 2026-07-26** (mockup iterated live with the user).
> Evolves the approved J3 feed-cockpit (`feed-cockpit-design.md`) with a
> **motivation-first, health-app + Co-Star-inspired** layer. Replaces the current
> cluttered `app/(app)/feed/page.tsx`. Built **strictly on the design system**
> (`docs/specs/design-system.md`) — tokens + `components/ui` primitives only, no
> hardcoded hex/px. Own PR when built.

## The problem it fixes

The current feed stacks 6+ competing full-width cards (overnight queue, reply desk,
goal cockpit, a 6-chip toolbar, digest, matches) — no hierarchy, no "do this now,"
and it feels like a chore list. The redesign makes opening RoleOS feel like opening
a health app: **you're hit with your streak and momentum first (dopamine), then a
short finishable list**, with all the rich intel kept but ranked below.

## Principle: win first, work second, depth on demand

```
MOTIVATION  →  streak · momentum · path        (you're winning — feel it)
ACTIONS     →  "what moves you forward today"   (short, finishable, ≤3)
BROWSE      →  plays (rich matches) · overnight  (the depth, ranked below)
```

## Layout (top → bottom)

1. **Hook line** — `text-h2 font-display`, e.g. *"Momentum is on your side."* (grape
   accent word via `text-primary`). RO's one-line read of the day.
2. **Streak hero** (`<Card>`, `coral` accent) — the motivator, front and center:
   big `🔥 N-day streak` + subline (*"your longest run yet"*), a **week-dot row**
   (7 days: past done = `coral`, today = `coral` + `shadow-ring`, future = `surf3`),
   and a pull line (*"Move once today and it's 6 days…"*). Component: `StreakCard`.
3. **Momentum aspects** — three quiet stat `<Card>`s: **`+N ⚡`** momentum
   (`volt`/`spark` energy card), **`2×`** faster, **`Week x/y`** ahead of pace
   (`text-suc`). Component: `MomentumAspects`.
4. **Your path** (`<Card>`) — the goal journey as a **constellation** (milestones
   Found → Applied → Interviewing → Finals → 🎯 Offer; done = `primary`, current =
   `primary` + `volt` ring). Component: `PathConstellation`.
5. **What moves you forward today** — section label + a mini `ProgressRing`
   (`1 of 3 · 15 min`), then ≤3 task `<Card>`s (done = `suc` check + warm ack,
   todo = `Button` "Open →"). Component: `TodayActions` + `ProgressRing`.
6. **Plays worth your time** — the rich match cards KEPT (reasoning · taste line ·
   comp · △watch · actions), first 1–2 shown + "Show N more." The browse zone.
7. **While you slept** — ONE collapsed `<Card>` summary ("🌙 …read 34, set aside 31,
   shortlisted 3 · see all ▸"), expands to the full log. Transparency kept, wall of
   text gone.
8. **Celebration** — slim line by default; on all-done, a `<Card>` moment
   ("Close all three and today is *yours* — streak becomes N").

## Design-system mapping (no drift)

| Element | Token / primitive |
|---|---|
| Accent / CTAs / current-milestone | `primary` (grape) · `<Button>` |
| Energy: momentum, charge bar, current-star ring | `volt` / `spark` / `spark-ink` |
| Streak flame + week dots | `coral` |
| Done / on-pace | `suc` (`text-suc`, `bg-suc-bg`) |
| Headlines | `font-display` · `text-h1/h2/h3` |
| Body / labels | `font-body` · `text-body/small/overline` |
| Containers | `<Card>` · `rounded-xl` · `shadow-ring` on focus |
| Fit / status chips | `<Badge>` |

New visuals (ring, streak dots, constellation) are SVG/CSS using **these token CSS
vars** (`var(--primary)`, `var(--volt)`, `var(--coral)`) — never literal hex.

## States (must all be designed)

- **Day 0 / no streak** — no flame; hero becomes "Start your streak — one move today."
- **Streak just broke** — candid, kind: "The streak reset — they always do. Today starts a new one." (ro-voice, never shaming.)
- **Off pace** — momentum honest (`warn`), path still shown; one real move offered, not guilt.
- **Empty day (nothing needs you)** — honest quiet day: one endorsed move max, rest is "I'm on it." (per feed-cockpit spec's honest-quiet-days rule.)
- **All done** — the celebration moment; streak increments; "come back tomorrow — I'll have read the night."
- **No goal set** — same home, motivation from streak/momentum; a compact "give RO a goal" invite in place of the path.

## Data it needs (mostly exists)

- **Streak / momentum / pace** — derive from `decision_events` (actions per day) +
  the plan/pace engine (`lib/goal`, `lib/plan`). Streak = consecutive days with ≥1
  action; momentum = weighted actions today; pace from the existing agenda.
- **Path milestones** — from `matches` + `applications`/tracker stages (counts per stage).
- **Today's 3** — the existing agenda (`computeAgenda`) capped at 3, finishable.
- **Plays** — existing `matches` (+ the P3 taste overlay line already shipped).
- **Overnight** — the existing digest content, collapsed.

No new tables required for v1; streak/momentum are derived. (A `streaks` cache can
come later if the per-request derivation is too heavy.)

## Guardrails

ro-voice on every string (candid, never shaming — a broken streak is kind, an
off-pace day offers one real move). Wellbeing gate holds (no dark-pattern pressure;
"healthy engagement" = return/completion, NOT session length — feed-cockpit §metrics).
Human-gated-outward untouched. Design system is the contract.

## Build order (when we build it)

P1 `StreakCard` + `MomentumAspects` + `ProgressRing` (pure presentational, storybook-
able). P2 `PathConstellation` + `TodayActions` wired to real agenda/matches. P3
assemble the new `feed/page.tsx`, collapse overnight, delete the old stacked cards.
Each on the design system, verified live, its own slice.

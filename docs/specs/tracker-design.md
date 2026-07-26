# Design PRD, Tracker (the funnel of record that keeps itself true)

> Status: **APPROVED design → READY to build** (human approved 2026-07-04/05, design-depth loop).
> Visual + microcopy source of truth: **https://roleos.fyi/proto/tracker/** (4 personas)
> · decisions: https://roleos.fyi/proto/tracker/decisions.html
> Tracker exists (slice 3 + W5 timeline/SLAs/next-action), this reshapes the daily
> experience: board view, self-maintenance, whose-move clarity, honest aging, kind endings.

## 1 · Problem & goal

Today's tracker is a capable list with SLAs; reading it still takes work, and its states
depend on the user remembering to update. Goal: "where does everything stand?" answered in
one glance, a board that keeps itself true from real events, and the journey's hardest
moments (ghosting, rejection) handled in the companion register while feeding the funnel
math. Success: one-glance clarity · zero chore-drags (drags occur only as corrections) ·
users steadied, not stung, after closures and rejections.

## 2 · Confirmed intent (human-signed; built under pre-authorization, walkthrough-approved)

A kanban-shaped board whose cards move THEMSELVES (human's combination: kanban view +
self-maintaining record). Stages advance from real events, sends, parsed replies, interview
dates, one-tap reports; dragging a card is a correction, welcomed and learned from. Her
pipeline read leads: one honest checkable paragraph; whose-move badges (yours / hers /
theirs) on every card. Honest, contextual aging with gentle ~30-day closure proposals and a
keep-hoping override excluded from pace math. Rejections get candid-never-cold delivery, a
collapsed closed section, and pattern-learning said out loud. Every outcome feeds funnel
calibration.

## 3 · Behavior spec (copy verbatim from the prototype)

**Her read (top):** one paragraph, persona-aware registers (healthy / your-move / worry /
news), checkable against the board below it. Never longer than a breath.

**The board:** columns by stage (applied / in conversation / interviewing / offer;
stacked groups on mobile). Every card: company/role · whose-move badge · an age line with
context ("3d, fresh; replies typically take 1–2 weeks" / "9d, day-10 follow-up ready
tomorrow") · the one next action as a button when it's the user's move (opens in the feed) ·
"wrong stage? tap to correct, it teaches her."

**Self-maintenance:** sources: /api/apply sends · Gate-2 inbox parsing (where Gmail
connected) · calendar · one-tap user reports ("had the call, went well"). Unverified
states carry honest provenance ("you told me"). No Gmail → warm one-tap confirms, never
nagging. Corrections (drag or tap) = decision events + a thank-you that names what she
misread; pace math updates itself.

**Aging & gentle closure:** per-company quiet-time norms where known; "past typical" →
nudge drafted (you-send, via feed). ~30 days quiet → closure proposal in the exact register
of the prototype ("no reply isn't a no on your worth, shall we file it kindly?") with
keep-hoping override: excluded from pace/funnel counts, still watched, some come back.
Closure timing is her proposal, never automatic. ⚑ Human challenge noted at approval: if
feedback shows the proposal stings, flip `closure_on_request_only` (flag ships).

**Rejections:** delivered by the voice formula (information, not verdict; forward motion
last). Role moves to the collapsed closed section (one folded line each, "learned from"
annotations). When patterns emerge (e.g. two final-round passes), SHE says what she's
adjusting out loud and does it (mock focus, positioning). "What do you think went wrong?"
gets an honest signals-based answer, never guessing dressed as fact.

## 4 · Data & guardrails

- Outcomes → personal funnel rates (dim 14) and X4 outcome-learning; keep-hoping exclusions
  respected in pace math.
- Decision events: corrections (+what she misread), keep-hoping, closure accepts, nudge
  reviews, quick reports.
- Human gate: the tracker sends nothing; nudges/follow-ups are drafted → feed → you-send.
- Warm-copy bar throughout; whose-move badges keep responsibility honest; provenance labels
  on self-reported states.

## 5 · Acceptance criteria (Definition of Done)

1. Board + her read at 375/768/1280, axe-clean; whose-move badges correct from real state;
   read checkable against board (no contradictions, unit-tested renderer).
2. Self-maintenance: each source advances stages correctly; unverified provenance shown;
   no-Gmail one-tap confirm path works; corrections write events + update pace inputs.
3. Aging: contextual age lines; past-typical nudge drafting; 30-day proposal + keep-hoping
   (verified excluded from pace); `closure_on_request_only` flag present.
4. Rejection flow: voice-formula delivery, collapsed closed section, pattern-adjustment
   fires on the defined trigger (≥2 same-stage passes) and is visible + actually applied.
5. **Tests (ratchet, net-new):** unit: stage-advance per source; correction event weights;
   keep-hoping pace exclusion; pattern trigger. E2E: healthy/your-move/ghost/rejection
   journeys per proto personas. Invariant suites stay green.

## 6 · Non-goals

Recruiter-reply drafting UX (Gate 2 / RO dock design) · offer & negotiation surfaces (X5) ·
interview prep itself (coach) · rebuilding W5 machinery (timeline/SLAs power the age lines).

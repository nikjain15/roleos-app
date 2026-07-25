# Design PRD - CORE · Practice & mock interviews (J12)

> Status: **APPROVED → READY** (human, 2026-07-05). Source of truth:
> https://roleos.fyi/proto/mocks/ · decisions: /proto/mocks/decisions.html
> EXTENDS the coach (question prediction, story mapping, mock skill, debriefs exist).

## Intent (human-signed)
Ready is a feeling you earn. Three modes in the user's order (human combo): quick drills
(recall), answer crafting (STAR built together, ends spoken-not-scripted - "say it like
you'd tell a friend"), and the centerpiece: the adaptive mock where RO BECOMES the
interviewer - persona + lens fed by the J11 brief, follow-ups that walk through doors the
user's answers open. Story-bank gaps are fixed BEFORE drilling ("you've done it - it's just
never been told as a story"). Debriefs are gains-first: what landed, ONE thing to sharpen,
re-mock-just-that, an honest readiness read including permission to rest. Voice mode is
designed as a state - identical flow + audio-only feedback (pace, filler, presence) -
shipping later per the X8 ruling (browser-native, flag-gated).

## Behavior spec - per the prototype
Prep surface: predicted questions (brief-fed) · story-bank coverage with gap-fix-first flow ·
three mode cards with honest durations. Mock: interviewer-persona banner (pause anytime;
"nothing graded until the debrief, and the debrief is on your side") · adaptive follow-ups ·
transcript persisted (skill + streaming per architecture - no DO). Debrief: two-landed +
one-sharpen max · re-mock-the-weak-spot (2-minute scoped) · readiness meter with
rest-as-strategy framing. Voice state: ghosted mic UI + "ships later" honesty; a
zero-switching-cost design contract (same screens, same debrief plus audio extras).

## Guardrails & data
Coach mode has NO autonomy setting (journey §5). Debrief tone: gains-oriented, never
shaming. Decision events: mode choices, gap-fix stories (→ master profile via
propose-approve), debrief outcomes (→ interview-focus dimension). Verified-before-shown +
"not right?" on debrief claims. Warm-copy bar.

## Acceptance
1. Three modes reachable per proto at 375/768/1280, axe-clean; gap-fix-first fires when the
   bank has a hole vs predicted questions.
2. Mock persona derives from the J11 brief; adaptive-follow-up eval (answer content must
   influence the next question - fixture transcripts).
3. Debrief: max-one-sharpen enforced; re-mock scopes to the flagged answer; readiness copy
   register per proto.
4. Voice state renders as designed-future (flag off) without dead ends.
5. Tests (ratchet): unit - gap detection, debrief shape; E2E - all four personas, full
   prep → mock → debrief → re-mock cycle. Invariants green.

## Non-goals
Voice infra itself (X8 flag) · interviewer research (J11) · offer prep (J13).

# Design PRD, CORE · Cover letters & outreach drafting (sounding like you)

> Status: **APPROVED design → READY to build** (human approved 2026-07-05, design-depth loop).
> Visual + microcopy source of truth: **https://roleos.fyi/proto/cover-letters/** (4 personas,
> live tone dial) · decisions: https://roleos.fyi/proto/cover-letters/decisions.html
> **EXTENDS W2's `draft_cover`** (truth gate, structured output, quality gate kept).

## 1 · Problem, goal & the world-class bar (CORE)

The world is drowning in ChatGPT cover letters and recruiters can smell them. The bar
(human-set, triple): **(1) sound like YOU:** voice learned continuously, indistinguishable
from you on a good writing day; **(2) honest about when letters matter:** she says when a
letter moves the needle and when it's theater; **(3) deepest research:** grounded lines
citing real sources (X2 briefs), specific never stalker-ish. Success: letters that don't
smell like machines (AI-tell rate ~zero), skip-verdicts trusted (write-anyway rate tracked),
voice-profile convergence (edit distance on her drafts trends down).

## 2 · Confirmed intent (human-signed, 2026-07-05)

Starts with honesty about whether to write at all (write-anyway always available). Voice is
learned three ways, continuously: a skippable 60-second interview before the first letter
(tone · one honest motivation sentence · optional writing sample), every edit anywhere,
micro-questions when signal is thin. Letters are short (~120 words), grounded (research
lines cite sources), and dialed (warm/direct/formal, remembered; edits outrank the dial).
Same comment system + 1-by-1 walker as the résumé editor. The outreach trio, cold note to
a hiring manager, day-10 follow-up that adds one new thing, thank-you built around a moment
the user names, shares all machinery; every send is the user's. Before any draft reaches
the user, the AI-smell check strips machine tells.

## 3 · Behavior spec (copy verbatim from the prototype)

**Write-or-skip verdict:** per company, evidence-based (ATS letter handling, stated hiring
practice from corpus/X2): "yes, write one, their team reads letters" or "skip it, their
ATS buries letters; your energy belongs in the take-home." Write-anyway one tap. Verdicts
carry their basis (confidence ladder).

**Voice profile (new first-class taste projection):** sources: the skippable interview
(3 questions, 60s), edit deltas from every craft surface, micro-question answers; confidence-
weighted; user-inspectable/correctable (Settings hook); continuously updated; powers letters,
outreach, screening answers. Her acknowledgments name the learning ("'fought to work on' -
that's more you than anything I've written").

**The letter:** ~120 words, honest word count shown; tone dial (warm/direct/formal)
genuinely rewrites (never adjective swaps), remembered as default, outranked by edits;
grounded lines carry source dots (tap → "their Q3 launch, from my company brief, real");
same typed comment system, lenses, and 1-by-1 walker as J9.

**The outreach trio:** cold note (~60 words, one real hook, no flattery, no "hope this
finds you well"); day-10 follow-up (adds ONE new thing, never "checking in"; feeds J6's
scheduled follow-up); thank-you (user names one real moment; she builds around it so it
reads like memory, not template). All drafts; sends live in Apply/Send or the user's mail.

**AI-smell check:** pre-delivery pass stripping machine tells (banned-phrase list extends
the quality gate's voice blocklist + judge attention on "statistically AI-ish" phrasing);
replacements must be profile-grounded specifics. The check's list is maintainable config.

## 4 · Inherited system requirements

Verified-before-shown (J8 §4) on every draft; "not right?" affordance on verdicts and
drafts; truth gate re-runs on user edits (J6); X2 briefs are the only research source -
citations must trace to a brief row (no invented company facts).

## 5 · Data & guardrails

Decision events: verdict overrides (write-anyway = signal), tone choices, walker outcomes,
interview answers, trio usage. Voice profile RLS-scoped, exportable/deletable, inspectable.
Human gate: all four artifact types draft-only. Warm-copy + calm-UX rules throughout.

## 6 · Acceptance criteria (Definition of Done)

1. Verdict renders per company with cited basis; both registers (write/skip) per proto;
   write-anyway works and is logged.
2. Voice interview: skippable, 60s, answers seed the voice profile; profile visibly updates
   from edits (acknowledgment lines fire); micro-questions trigger only on thin signal.
3. Tone dial: three genuine rewrites (eval: cross-tone lexical distance threshold), default
   persisted, edits outrank.
4. Letters/notes render with source dots tracing to real X2 brief rows; a citation without
   a source row is impossible (test).
5. Trio: all three types draftable in the same editor; follow-up wires to J6's day-10 slot;
   thank-you requires + uses the user-named moment.
6. AI-smell: banned-list pass + judge; eval set of known tells scores ~zero leakage.
7. **Tests (ratchet, net-new):** unit: verdict basis mapper; voice-profile update paths
   (interview/edit/micro-q); tone persistence; citation tracing. E2E: all four personas;
   first-letter flow incl. skip path; a full trio cycle. Invariant suites stay green.

## 7 · Extends vs exists (builder contract)

**KEPT:** `draft_cover` skill shape (structured subject/body/rationale) · truth gate ·
quality gate `full` · Apply-page integration (J6 bundle).
**NEW:** write-or-skip verdict · voice profile (projection + Settings hook) · voice
interview + micro-questions · tone dial · outreach trio skills (`draft_cold_note`,
`draft_followup`, `draft_thankyou`) · AI-smell pass · source dots / citation tracing ·
walker + comment system reuse from J9.

## 8 · Non-goals

Sending (human-gated elsewhere, always) · referral/warm-intro pathfinding (feature 13) ·
interviewer-person research (X2 non-goal stands until feature 10's human decision) ·
long-form letters (~120 words is the discipline).

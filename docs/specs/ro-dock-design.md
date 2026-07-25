# Design PRD - RO dock / chat (she's always here, verified, and self-improving)

> Status: **APPROVED design → READY to build** (human approved 2026-07-05, design-depth loop).
> Visual + microcopy source of truth: **https://roleos.fyi/proto/ro-dock/** (4 personas;
> host screen changes live behind the chat) · decisions: https://roleos.fyi/proto/ro-dock/decisions.html (v0.3)
> The dock exists (slice 7 RO-everywhere + W3 act-verbs + W6 persistence) - this designs the
> RELATIONSHIP it carries, plus two human-mandated system requirements (§5, §6) that apply
> product-wide with the dock as first surface.

## 1 · Problem & goal

The dock today is a capable command popover; it is not yet a companion. Goal: RO present on
every screen as one continuous, context-aware relationship - safe to bring anything, able to
act in place under the same gates, honest about being an AI, and (new) verified before shown
with a closed feedback loop when she's wrong. Success: companion-register conversations
actually happen · act-verbs used from chat · zero re-introductions · reported-wrong-answer
rate trends down monotonically.

## 2 · Confirmed intent (human-signed, 2026-07-05)

A small quiet chip on every screen that never expands uninvited, opening into one continuous
conversation spanning the whole journey. She knows the screen you're on and remembers
everything shared. Bring her anything - she reads the register (operator/coach/companion).
Asked to act, she acts in place with the same gates as everywhere; bulk actions get an
itemized confirm; nothing outward bypasses review-and-send. The companion has a spine:
honest she's an AI, nudges toward real people, quiet when you go quiet, recommends rest
against her own engagement.

## 3 · Behavior spec (copy verbatim from the prototype)

**Presence** - persistent chip, tiny collapsed, never self-expanding; host dims (not
blocked) when open; same thread from any screen.

**One conversation, context-aware** - single thread with day markers, past visible;
screen-context injected ("you're looking at this week's queue…"); long-thread summarization
under the hood (extends W6). Preferences stated in passing ("the NYC energy tempts me") are
first-class taste signals, held and cited later with care.

**Registers** - operator (does/answers), coach (sharpens), companion (steadies). Emotional
messages get the companion in full - never a task pivot. The dependence-adjacent template
(human-approved): warm gratitude → honest "I'm an AI" → point at real people ("who's the
friend you'd call?"). The 11pm-mock refusal stands: she declines requests that hurt the
user, warmly, with the reason and a better alternative ("sleep is the best prep left").

**Acting in place (W3 act-verbs, given their moments)** - edits happen live behind the chat
(visible change + diff offered, "still goes nowhere until you send it"); bulk actions:
itemized preview + explicit confirm + undo location + what-it-teaches note; declines
respected warmly ("good instinct to double-check me"). No transport from chat, ever.

## 4 · Verified before shown (human requirement #1 - system-wide, dock first)

Two-model pipeline on EVERY dock reply: RO drafts on the reasoning tier → deterministic
checks (truth-gate, privacy, blocklists - milliseconds) → a separate fast-tier checker
verifies accuracy, guardrails, and voice → pass = shown; fail = one auto-fix + re-check;
still failing = honest "let me double-check that - one moment," never a wrong answer and
never a raw error. **Latency budget: ≤1s added**, achieved by fast-tier judging +
overlapping the check with generation; verification is never skipped for speed (standing
rule: quality is never traded for latency; speed is its own optimization track).
Extends `agent/quality-gate.ts`, which today skips voice-judging chat - that exemption ends.
All verdicts metered to agent_runs; pass rates on the admin dashboard.

## 5 · Wrong-answer feedback loop (human requirement #2 - system-wide, dock first)

Every RO reply carries a quiet "not right?" affordance. On tap: (1) she owns it in the
recovery voice ("Good - scratch that, my mistake. What did I miss?") and captures the
correction; (2) highest-weight decision event + the full agent_runs trace auto-flagged into
a per-skill eval set; (3) BOTH models (answerer and the checker that approved it) are
continuously measured against every reported case; (4) escalation ladder on accuracy
thresholds: prompt fix → checker tightened → **model swap via the registry** (config, not
code) → backup model on provider degradation. Admin: accuracy trends per skill/model.
Goal: a reported wrong answer is structurally the last of its kind. The affordance ships on
all RO outputs (matches, résumé lines, the mirror), with the dock as the first surface.

## 6 · Data & guardrails

Everything shared feeds taste (RLS-scoped, exportable/deletable). No transport from chat
(W3 invariant + tests). Companion ethics enforced in prompt + evals: no dependence-farming,
no engagement optimization, rest recommended when right, quiet-when-quiet (dock never
re-pings after a companion conversation ends). Warm-copy bar on every string.

## 7 · Acceptance criteria (Definition of Done)

1. Chip + panel on every app screen at 375/768/1280, axe-clean; one persistent thread with
   day markers; screen-context correct on ≥ all main surfaces.
2. Register routing: task/emotional/dependence test prompts produce the right register
   (eval set incl. the approved template lines); 11pm-style harmful requests get
   warm-refusal-with-alternative.
3. Act-in-place: edit verbs change the underlying artifact live + diff; bulk verbs preview →
   confirm → undo; transport impossible (invariant tests extended to dock routes).
4. **Verification pipeline** (§4): measurable ≤1s p50 added latency; fail-path copy per
   spec; chat voice-judging enabled; verdicts metered.
5. **Feedback loop** (§5): "not right?" on every reply → owned response + event + eval-set
   entry; admin accuracy trends render; registry swap procedure documented + drilled once.
6. **Tests (ratchet - net-new):** unit: register router; bulk-confirm flow; checker
   fail→fix→refuse path; eval-set ingestion from a report. E2E: all four proto personas'
   journeys; context-awareness across two screens; feedback tap round-trip.
   Invariant suites stay green.

## 8 · Non-goals

Voice input/output (X8, flag-gated later) · nudge/digest cadence (feature 16) · rebuilding
W3/W6/slice-7 machinery (extended, not replaced) · the checker's own model choice being
user-visible (admin concern).

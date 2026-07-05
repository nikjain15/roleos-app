# Design PRD — Apply / Send (the sacred gate)

> Status: **APPROVED design → READY to build** (human approved 2026-07-04, design-depth loop).
> Visual + microcopy source of truth: **https://roleos.fyi/proto/apply-send/** (4 personas)
> · decisions: https://roleos.fyi/proto/apply-send/decisions.html
> Apply exists (slice 4 + W2 letters + X3 quality score) — this deepens the ceremony around
> the product's ONE outward gate. Same send path; richer review, prouder handoff.

## 1 · Problem & goal

The apply page bundles well but reviews thin: summaries aren't editable in place, the
quality score is a card rather than an advisor, and the ATS handoff undersells itself.
Goal: a review that makes genuine judgment fast, edits that teach her voice, a handoff owned
proudly as the product's principle, and a post-send moment that prevents anxiety. Success:
healthy expand/edit rates (review is real, not rubber-stamp), fix take-rate, and post-send
return-without-anxious-refresh.

## 2 · Confirmed intent (human-signed, 2026-07-04)

One review screen: her one-line summary per piece with the quality verdict on top as an
advisor — one-tap fixes that show their work and re-score, never a blocked send — and every
piece fully editable in place, edits welcomed as voice lessons and quietly re-scored. The
handoff is owned proudly: the last click happens on the company's site on purpose, made
two-minutes-easy with per-field copy blocks. The truth gate holds at the sharpest point.
After the send: real celebration, honest odds, her visible next move. Tracker advances
itself.

## 3 · Behavior spec (copy verbatim from the prototype)

**Review (one screen)** — quality advisory on top: strong (87 + one lift, one tap) and weak
(61 + honest framing + two fixes + "I never hold the door shut") registers; fixes insert the
exact new line highlighted AND editable, then re-score visibly. Pieces (resume / cover
letter / screening answers): summary line → open → **edit in place**. Any edit gets a warm
voice-lesson acknowledgment and a quiet re-score; edits are high-weight decision events
feeding the drafting voice model. **Edited pieces MUST re-run the truth gate** before
bundling — an un-traceable claim gets a warm flag ("that's a strong claim — help me back it
up"), never a silent pass (resolves proto challenge #3).

**Truth-gate moment** — when a screening question asks for something master_profile can't
support: surfaced IN the review, before the send; she refuses to invent, offers an honest
reframe that still lands ("use this / edit it"), and invites the missing story ("actually I
do have it — here's the story" → quick capture → profile grows).

**Handoff** — ATS: per-field copy blocks in their form's order + tailored-PDF download +
"Open their form"; return affordance "I sent it — take over the watching"; unfinished
handoffs wait, packed, zero guilt. Email variant: filled Gmail draft, their mail app's send
button is the gate. Copy frames the gate as principle: "the last click happens on their
site — on purpose: nothing leaves without your hand on it."
"I sent it" is self-reported (accepted at approval); where Gmail is connected, sends are
corroborated by Gate-2 inbox parsing; tracker marks unverified sends normally, no nagging.

**Post-send** — celebration first; honest odds ("about 1 in 4 gets a reply, usually inside
two weeks") using population benchmarks until personal rates accrue (then personalized —
"your rate is running better than that"); her visible watch: reply-channel monitoring +
day-10 follow-up already drafted (you-send); tracker → applied automatically; gentle next
choice (next application / done for today), pace-aware.

## 4 · Data & guardrails

- **Human gate unchanged and celebrated**: /api/apply-shaped path only; final action is the
  user's explicit click on the company's surface or their own mail app.
- **Truth gate on edits** (new requirement): the same claim-tracing check runs on user-edited
  content; warm flag, never silent shipping of un-backed claims the user typed.
- Decision events: edits (voice lessons, high weight), fix accept/decline, truth-gate
  choices (reframe used / story taught / edited), send, abandon-at-handoff.
- Odds copy follows the confidence ladder (benchmark vs personal rates labeled).
- Warm-copy bar everywhere; no guilt on unfinished sends; metering on fix/re-score calls.

## 5 · Acceptance criteria (Definition of Done)

1. Review renders per proto at 375/768/1280, axe-clean; all three pieces open + edit in
   place; edits produce acknowledgment + re-score + decision events.
2. Quality advisory: strong/weak registers; one-tap fixes insert highlighted editable lines
   and re-score; send never blocked; declines respected (no re-nag same fix).
3. Truth gate: unsupported questions surface pre-send with reframe + teach-me paths;
   **edited content re-runs the gate** (unit + E2E for a user-typed un-backed claim).
4. Handoff: ATS field mapping + PDF + copy blocks; email variant opens filled draft;
   "I sent it" advances tracker; abandoned handoff persists packed without nagging.
5. Post-send: celebration + odds (benchmark→personal switch tested) + follow-up draft
   scheduled day-10 (you-send) + reply-watch wired to Gate-2 where connected.
6. **Tests (ratchet — net-new):** unit: re-score on edit; truth-gate-on-edit; odds
   source switch. E2E: full send ceremony (fix → edit → handoff → sent); weak-bundle path;
   truth-gate path both directions; email variant. Invariant suites stay green
   (no-send-tool, apply-only path).

## 6 · CORE addendum — the quality read, in depth (human-approved 2026-07-05)

Deepens §3's advisory per the amended feature order. Proto: https://roleos.fyi/proto/apply-send/score.html
· decisions v0.2. Four commitments:
1. **Score + three named ingredients** (human combo): the number for a glance; beneath it
   Evidence match / One story / Hygiene, each in WORDS (strong/almost/thin/clean — never
   decimals). The user always sees which lever to pull.
2. **Layered explanation** (human combo): the weakest ingredient's one-line reason is always
   visible on its row; the full because-therefore + drafted one-tap fix behind "the full
   why". Concise/detailed toggle applies.
3. **Craftsman's pause + the firm word, ONCE** (human combo): default register = warm
   hold-it-a-day; a genuinely weak bundle at a company the user marked as mattering gets ONE
   firmer sentence ("I really would hold this one") — never repeated, never colder, never
   blocking (the J6 rule stands).
4. **Receipts once honest**: the read shows its track record from the user's OWN outcomes
   when N is honest (~10–12 sends) — wins and misses alike; before that, explicitly labeled
   benchmark-based. Accountability per the J8 wrong-answer rule.
Acceptance additions: ingredient mapper unit-tested; firm-word fires at most once per
bundle (state-tested); receipts switch benchmark→personal at the N threshold (tested);
X3's scorer refactored to emit the three ingredients (extend, don't rebuild).

## 7 · Non-goals

Automating the final ATS submission (rejected on principle + ToS) · tracker views beyond
the auto-advance (Tracker design, next) · recruiter reply drafting UX (Gate 2 exists;
RO dock design later) · offer/negotiation (X5 exists).

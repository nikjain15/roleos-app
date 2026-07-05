# Design PRD — Explore & role discovery (the proving ground)

> Status: **APPROVED design → READY to build** (human approved 2026-07-04, design-depth loop).
> Visual + microcopy source of truth: **https://roleos.fyi/proto/explore/** (anon/member
> personas, canned asks) · decisions: https://roleos.fyi/proto/explore/decisions.html
> Explore exists (index browse + Ask conversational + W1 fit badges + W6 anon persistence) —
> this unifies it into ONE conversational-browse surface with the honesty features below.

## 1 · Problem & goal

Today /explore is a browse page and an Ask page sharing a URL. Goal: one surface where a
skeptic tests "an agent runs your hunt" on real roles they choose — RO speaks first, her
answers act on a scannable list, and every fact is honest (pay provenance, freshness,
no fake fit). Primary user: the **anonymous evaluator** (funnel stage 2); signed-in gets the
same surface plus real fit and the gap moment. Success: **curiosity → onboarding** —
Explore→onboarding starts and their save rate; gap moments resolving either direction
without trust loss. No time-on-page metrics.

## 2 · Confirmed intent (human-signed, 2026-07-04)

Conversational browse: RO greets first and her ask-bar leads, but answers act directly on a
scannable, filterable list — one surface, no forced typing. Cards carry honest essentials:
pay labeled "their number" vs "my estimate," posted-and-checked timestamps, one line of her
judgment ("what this job really needs"). Fit is never faked: anonymous visitors get a warm
30-second invitation landing in onboarding's Explore arrival. Closed roles are marked and
redirected, never silently deleted. Signed-in users see real fit everywhere; "why didn't you
show me this?" becomes honest reasoning + their override + her learning. Empty results get a
straight no + closest almost-fit labeled + keep-watch offer.

## 3 · Behavior spec (copy verbatim from the prototype)

**Surface** — RO's one-sentence greeting (anon vs member variants) · ask-bar with suggested
asks · filter chips (work without typing) · role list.

**Ask → list**: her reply renders as one short commentary AND the list re-filters/re-sorts;
chips sync to reflect the applied filter so the user can adjust by hand from wherever her
answer left them. Anon conversation persists across loads (W6 exists — keep).

**Card (honest essentials)**: company/title · comp with provenance label (stated / RO
estimate / their claim) · "posted X · checked by RO Y" · location/remote · ONE plain-English
"what this job really needs" line (from existing extraction) · full-read link.
Anon: fit-tease block ("Would you get this one? … 30 seconds and I'll be straight") →
onboarding Explore arrival (J1's `?from=role:<id>` variant) carrying the role id.
Member: real fit badge (W1 exists) + status ("in your matches / worth a look / she passed").

**Full read** (per role): the 2–3 requirements that actually decide it vs decoration ·
honest flags (hybrid reality, visa silence, loop speed where known) · anon fit-tease or
member fit verdict with link to the existing draft/feed.

**Gap moment** (member, roles she passed on): "Why isn't this in my matches?" → on-demand
honest reasoning → "add it anyway — teaches me" (high-weight decision event, adds to
pipeline + triggers re-rank consideration) or "good call, skip" (also an event). Never
re-litigates a decided role unprompted.

**Freshness**: every card shows checked-cadence; closed-since-last-check roles are marked
(dimmed, labeled) with her condolence + "close cousins" pivot — never silently removed.
Depends on the role-refresh loop for cadence; PRD ships with whatever cadence exists,
honestly displayed.

**Empty ask results**: straight no ("I'd rather tell you that than show almost-fits dressed
up as answers") + closest match labeled "N of M" + keep-watch card (states the account
requirement upfront — no surprise walls).

## 4 · Flags resolved at approval (+ build-time gates)

- **"May level down" label**: approved in spirit; ship ONLY with calibrated wording ("reads
  like they'll level down") + an offline eval of the classifier prompt before the label goes
  public. Behind a flag; default ON once the eval passes. She may publicly doubt employers —
  with evidence-calibrated language, never as a bare accusation.
- **Greeting speaks first**: approved — one sentence, genuinely useful, never repeats within
  a session.
- **Keep-watch states the account cost upfront**: approved (candor over conversion).
- **Gap-reasoning cost**: one metered reasoning call per tap; H3-style rate limit.

## 5 · Data & guardrails

Decision events: gap overrides/agreements (override = high weight), keep-watch requests,
tease→onboarding starts (funnel attribution). Anon stores nothing server-side beyond the
existing W6 conversation persistence. Truth gate: pay provenance labels required — no
unlabeled numbers; no fit shown without a profile. RLS; `zod`; rate limits on ask +
gap-reasoning routes; all copy passes warm-bar + jargon blocklist.

## 6 · Acceptance criteria (Definition of Done)

1. One unified surface at 375/768/1280, axe-clean; greeting/ask/chips/list behave per proto.
2. Ask responses re-filter the live list with commentary; chips sync; no dead chat pane.
3. Cards show pay provenance + checked-cadence on real data; closed roles marked with the
   cousins pivot (E2E: a closed role never 404s silently).
4. Anon tease → onboarding arrival carries the role id; the arrival's guaranteed-verdict
   works end-to-end (J1 dependency).
5. Member: fit badges everywhere; gap moment renders on-demand reasoning; both responses
   write correct decision events; "add anyway" lands in pipeline.
6. Empty-ask path: honest no + N-of-M closest + keep-watch (account gate stated).
7. **Tests (ratchet — net-new):** unit: pay-provenance labeling; ask→filter mapping; gap
   decision-event weights. E2E: skeptic path (browse → ask → tease → onboarding start);
   member gap path both directions; closed-role display. Eval: level-down classifier gate.
   Invariant suites stay green.

## 7 · Non-goals

Rebuilding ingestion/refresh cadence (role-refresh loop plan) · the public marketing index
page (roleos.fyi stays as is; this is the app's /explore) · saved searches / job alerts UI
beyond keep-watch (future) · Role workspace surfaces (next design).

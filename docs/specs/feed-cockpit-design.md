# Design PRD, Feed / cockpit (the home: brief → Today → judge → trust)

> Status: **APPROVED design → READY to build** (human approved 2026-07-04, design-depth loop).
> Visual + microcopy source of truth: **https://roleos.fyi/proto/feed-cockpit/** (5 personas +
> arrange state via debug bar) · decisions: https://roleos.fyi/proto/feed-cockpit/decisions.html
> The feed exists (slice 2 cockpit + 7 dock + 8 learning + 9 nudges), this deepens the daily
> experience into the shape below. Re-organize the surface; reuse the engines.

## 1 · Problem & goal

Today's feed is a stack of capable cards without a daily rhythm. Goal: every open answers
"what needs me" and "am I on pace" in ten seconds, makes the day finishable, and turns RO's
background work into visible, inspectable trust. Success (human-agreed after explicit
pushback AGAINST raw engagement): **healthy engagement:** unprompted daily return rate,
Today-list completion rate, decision latency (surface → judgment). Explicitly NOT session
length or scroll depth; the best visit is short.

## 2 · Confirmed intent (human-signed, 2026-07-04)

RO's 1–2 sentence morning brief flows into a capped, finishable, goal-aware Today list
(decisions-led with a quiet goal invitation when no goal exists), then a full honest
activity log, every line expandable to her reasoning. Light judgments happen on the card;
heavy work opens its full screen. Zones are user-arrangeable and RO proposes layout changes
from observed behavior, never rearranging alone. Quiet days are honest calm plus at most one
real optional move from actual gap analysis, with rest always legitimate.

## 3 · Zones & behavior (copy verbatim from the prototype)

**Z1 · Brief + Today (pinned):** brief is 1–2 sentences, warm, persona-aware (on-track /
catching-up / heavy / quiet / no-goal variants in the proto). Today: derived from the plan
agenda (exists, `computeAgenda`), capped ~3, minutes labeled, checkable; completing all →
celebration + permission to leave ("you're done for today, genuinely"). Goal strip beneath
(pace chip + one next action). Heavy days: overflow waits with the honest line ("3 more for
tomorrow, on purpose; nothing time-sensitive, I checked" + peek link).

**Z2 · Needs your judgment:** cards with: her one-line why, mode tag (you send / co-create),
diff/evidence one tap away, inline actions (approve-send / skip / dismiss) + ALWAYS "open
full view". Heavy artifacts (studio, mocks, full application) are doorways only. Skips invite
an optional reason ("want to tell me what felt off? Either's fine").

**Z3 · Activity log ("what I did while you were away · all of it"):** full visible log,
timestamped; routine batches = one honest line; EVERY line expands to plain-English reasoning
(the existing agent_runs traces, translated to user voice, no jargon).

**Personalization:** reorder / collapse / hide any non-pinned zone (persisted per user,
`profiles` prefs). RO proposes layout changes from observed behavior with easy undo; she
never auto-rearranges. Accept/decline = decision events.

**Quiet day:** honest calm + proof of watch ("I checked 34 postings; none beat what you
have") + max ONE real optional move sourced from actual gap analysis (e.g. story-bank gap
from interview map) + rest endorsed. No manufactured busywork, ever.

**No-goal:** same zones; decisions lead; goal invitation card in flow (J2's card). No
separate browse-mode.

## 4 · Flags resolved at approval

- **Inline send friction:** approved as designed, send allowed from the card after the
  summary (diff one tap away). Build behind a small flag (`require_diff_open_to_send`) so
  the stricter variant is a config flip if evidence demands it.
- **Rough-patch brief register** (companion voice after e.g. 3 rejections in a week):
  explicitly deferred to the Nudges & digests design, leave the brief copy source
  pluggable so that slice can add registers without rework.

## 5 · Data & guardrails

- Decision events: every inline judgment, skip reason, layout change, suggestion response.
- **Human gate unchanged:** inline send = explicit user click on a surfaced draft; the only
  send path remains the /api/apply-shaped route; no new outbound paths.
- Wellbeing: completion celebrated, absence never punished, quiet days legitimize rest, no
  engagement bait. Voice bar per goal-setup PRD §5 (acknowledge → truth → forward) applies
  to every string, including labels.
- RLS on prefs + reads; `zod` on changed routes; log-reasoning strings pass the jargon
  blocklist (shared with J1's ticker test).

## 6 · Acceptance criteria (Definition of Done)

1. Zones Z1–Z3 live at 375/768/1280, axe 0 serious/critical; copy matches prototype register.
2. Today derives from the live agenda, caps correctly, celebrates completion; heavy-day
   overflow behaves per proto (visible-but-quiet + peek).
3. Inline approve/skip/dismiss work with diff preview; full-view always reachable; send
   lands in tracker exactly like the full path (one send code path).
4. Activity log renders real agent activity with per-line reasoning expansion; routine
   batches compressed; no jargon (blocklist test).
5. Personalization: reorder/collapse/hide persists; RO layout suggestions fire from real
   usage signals, respect declines (never re-suggest a declined change).
6. All five persona states reachable with real data conditions (on-track/behind/heavy/
   quiet/no-goal).
7. **Tests (ratchet, net-new, all green):** unit: agenda→Today mapping + cap/overflow;
   suggestion-decline memory; decision-event writes (judgments, layout). E2E: morning flow
   incl. completion celebration; inline send → tracker; quiet-day state; no-goal state.
   Invariant/guardrail suites stay green.

## 7 · Non-goals

Full-view workspaces themselves (Role workspace / Apply/Send / RO dock, later features) ·
rough-patch brief registers (Nudges & digests) · notification delivery (H2/Nudges) ·
rebuilding agenda/pace engines.

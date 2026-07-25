# Design PRD - CORE · Referral & warm-intro finder (J14)

> Status: **APPROVED → READY** (human, 2026-07-05). Source of truth:
> https://roleos.fyi/proto/referrals/ · decisions: /proto/referrals/decisions.html
> BUILDS X6's approved PRD - sources A (the user's own connected data) + D (public records)
> ONLY; B after Google verification; C (LinkedIn) last-and-prefer-never (standing ruling).

## Intent (human-signed)
Warm paths found, never spent for you. Paths surface before cold applies ("a referral
roughly triples reply odds"), each with visible source provenance (A or D). Before
drafting, one honest question - how well do you actually know this person? - and the
answer genuinely shapes the ask (friend / friendly ex-colleague / barely). Every ask is a
per-person draft sent from the USER'S own accounts. RoleOS never contacts anyone; there is
no batch mode; semi-automated sending was explicitly REJECTED - relationships are not hers
to spend. No path found = said straight, with the cold-note alternative (J10 trio) and a
tell-me-a-name door (user-provided contacts, drafted for whatever the relationship is).

## Behavior spec - per the prototype
Path cards: person, connection basis, source label · the closeness question (three
registers, each producing a genuinely different draft - tested) · ask drafts: zero-pressure
framing, an easy no built in, coffee-either-way warmth · open-in-your-email only ·
none-found honesty with the two doors.

## Guardrails & data
THE gate: no transport, no batch, no auto - invariant-tested like the send gate. Sources
allowlisted to A+D (test: no other source type can produce a path). Closeness answers and
ask outcomes are decision events. Person data is not persisted beyond the path card.
Warm-copy bar.

## Acceptance
1. Paths render only from A/D sources with provenance; closeness shapes drafts (three
   fixture diffs); all three personas per proto.
2. Asks leave via the user's mail client exclusively; no send-capable code path
   (dependency-cruiser rule extended to this module).
3. None-found → honest copy + trio handoff + name-capture flow.
4. Tests (ratchet): unit - source allowlist, closeness→register mapping; E2E - path →
   closeness → draft → mail handoff; none-found path. Invariants green.

## Non-goals
LinkedIn anything (standing ruling) · referral-bonus mechanics · contact syncing beyond the
approved sources.

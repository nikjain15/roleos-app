# Design PRD, CORE · Offer & comp co-pilot (J13)

> Status: **APPROVED → READY** (human, 2026-07-05). Source of truth:
> https://roleos.fyi/proto/offers/ · decisions: /proto/offers/decisions.html · EXTENDS X5.

## Intent (human-signed)
The biggest decision of the journey, not faced alone. Single offer: celebrate FIRST, then
the honest benchmark with receipts (stated bands + comparables; estimates labeled per the
confidence ladder) and levers each with honest odds. Counters: one ask, a reason they can
repeat internally, an easy yes, drafted every round, sent by the user's hand. Multi-offer:
trajectory-aware comparison beyond money; her lean given with receipts, citing the taste
moments that ground it, LINKED to the originating decision events (verifiable, never
presumptuous), then the wheel handed back warmly. Either choice: graceful close drafted,
other doors kept warm, and the decision feeds the review's learning ledger.

## Behavior spec, per the prototype
Offer intake (parse base/equity/bonus/level) → celebration → benchmark with tap-to-source →
levers (strong / fallback / always-ask registers with likelihood + basis) → counter draft +
why-this-works note → open-in-email (user sends) → multi-round drafting on parsed replies.
Multi-offer: differences-only table + her lean block (receipts linked) + "your call."

## Guardrails & data
Human-gated outward absolute (all sends via the user's mail). Confidence ladder on every
number. Decision events: lever picks, counter edits (voice lessons), the final choice with
stated reasons (highest-weight taste signal; feeds the ledger + outcome learning).
Warm-copy bar: celebrate before strategy, a non-negotiable register.

## Acceptance
1. Both personas' flows per proto; benchmark receipts trace to real comparables; the
   estimate-vs-stated labeling is enforced (test: no unlabeled number renders).
2. Her lean cites at least one linkable taste inference; the link resolves to evidence events.
3. Counter drafts follow the one-ask structure (lint rule on skill output); multi-round
   drafts trigger on parsed replies where Gmail is connected.
4. Tests (ratchet): unit, lever likelihood mapper, lean citation linker; E2E, single
   (intake → counter → sent) + multi (compare → lean → choice → graceful close). Invariants green.

## Non-goals
Comp data sourcing beyond X5's corpus · deep equity modeling (v2) · auto-negotiation (never).

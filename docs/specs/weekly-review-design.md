# Design PRD, CORE · Weekly strategy review (J15)

> Status: **APPROVED → READY** (human, 2026-07-05). Source of truth:
> https://roleos.fyi/proto/weekly-review/ · decisions: /proto/weekly-review/decisions.html
> EXTENDS X7 (review page + skill exist).

## Intent (human-signed)
Ten minutes of stepping back that keep the weeks pointed at the goal. Good weeks: honest
numbers (personal rates vs planned, labeled), what's working WITH evidence ("letters
leading with the fraud story got replies at 2×, making it the default opener"), and ONE
next-week focus (rest-as-strategy allowed). Rough weeks lead companion-first: acknowledge →
honest pattern ("both passes came at final round, a pattern with a fix, not a verdict") →
one fixable thing → belief; charts available, never leading. THE keystone: the learning
ledger, this week's taste-model updates in plain English, each with evidence + confidence,
confirm / fix / strike inline; corrections are the highest-weight signal in the system.
The ledger is the same object Settings exposes; the steering moment is here, right after
she shows her work.

## Behavior spec, per the prototype
Three registers (good / rough / ledger) per proto copy. Ledger entries: statement + from +
confidence; strike = forgotten everywhere + downstream recompute; fix = guided correction
capture. Pace changes proposed, never imposed (goal-engine rule). Reviews persist
(notifications kind exists); the user's click generates fresh ones (X7 pattern kept).

## Guardrails & data
The rough-week trigger uses real signals only (a shared detector with J16's rough-patch
register, one implementation). Ledger writes: confirm/fix/strike as weighted decision
events; strike cascades (tested). Warm-copy: acknowledge → truth → forward enforced on the
rough register.

## Acceptance
1. Three personas per proto at 375/768/1280, axe-clean; the ONE-focus rule enforced.
2. The ledger renders real taste_model rows in plain English (jargon blocklist); all three
   actions round-trip; strike verifiably removes influence (ranking diff test).
3. The rough register fires only on the shared detector, never on thin evidence.
4. Tests (ratchet): unit, ledger action semantics, the detector; E2E, all three personas,
   the strike cascade. Invariants green.

## Non-goals
Daily cadence (J16) · the Settings ledger surface (J17, same data, different room) ·
re-planning mechanics (the goal engine owns those).

# Design PRD — Settings / account / data controls (J17)

> Status: **APPROVED → READY** (human, 2026-07-05). Source of truth:
> https://roleos.fyi/proto/settings/ · decisions: /proto/settings/decisions.html
> Unifies existing prefs + the taste/voice models into one surface.

## Intent (human-signed)
Not a config page — the CONTRACT SURFACE, where the product's promises become inspectable.
Four zones. What she knows: taste model + voice profile in plain English, evidence and
confidence shown, correct/strike inline (the same ledger as J15 — one underlying object).
What she does: every dial in one place (notification cadence, quiet hours, push-mode
intensity, overnight hunt, interviewer research with per-interview opt-out, feedback depth,
connections with what-she-reads transparency) — plus the one non-dial stated proudly:
"Send anything on my behalf: not a setting — never." What you've flagged: the "not right?"
history and what structurally changed because of each (the J8 accountability loop, made
visible). The exits: export-everything, pause-without-pings, delete-everything — real
buttons, one honest confirm, zero dark patterns. Leaving as honest as staying.

## Behavior spec — per the prototype
Three personas' surfaces verbatim. Ledger actions share one component with J15. Dials write
the existing prefs (notif_settings, quiet_hours, autonomy jsonb — they exist). Flag history
renders from the J8 eval-set records. Export = the full user-data bundle (all RLS-scoped
rows, one file). Delete = complete, single-confirm, immediate.

## Guardrails & data
The never-dial is rendered, not configurable (and backed by the no-send invariant tests).
Export/delete cover EVERY user table (a test enumerates the schema). Dial changes are
decision events. Warm-copy; no retention tricks (test: the delete path has exactly one
confirm).

## Acceptance
1. Four zones per proto at 375/768/1280, axe-clean; the ledger component is shared with J15.
2. Every dial round-trips to its real pref and takes effect (per-dial E2E).
3. Flag history shows real flagged items and their structural outcomes.
4. Export produces a complete bundle (schema-enumeration test); delete removes all
   RLS-scoped rows and confirms exactly once.
5. Tests (ratchet): unit — dial mappers, export completeness; E2E — all three personas,
   export + delete on a fixture account. Invariants green.

## Non-goals
Billing (deferred since Flag B) · team/multi-user · admin surfaces (they exist separately).

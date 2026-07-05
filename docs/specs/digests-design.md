# Design PRD — Nudges & digests (J16)

> Status: **APPROVED → READY** (human, 2026-07-05). Source of truth:
> https://roleos.fyi/proto/digests/ · decisions: /proto/digests/decisions.html
> Implements journey §10's locked interrupt economy; delivery rides H2's flag-gated email.

## Intent (human-signed)
She earns the interrupt. The daily digest is the feed's morning brief DELIVERED — her two
sentences, the finishable Today list, one pace line; same voice, deliberately no new
information (a door, not a second product). Cadence is one setting (real-time / daily
default / weekly / only-when-I-open). THE new register: rough-patch (owned here, deferred
from J3, applied to the in-app brief too) — after real hard signals, cheer drops and the
companion leads: "one gentle thing for today — the rest can wait… everything else, I'm
carrying." Push: rare, earned, user-actionable only (~1/day, ~3/week caps); quiet hours
absolute; the never-list (streaks, you-haven't-logged-in, ACT NOW) banned in code; when the
user goes quiet, she goes quieter — the way back is one gentle door, never a pile of guilt.

## Behavior spec — per the prototype
Digest template: subject specific + honest · brief → Today (one-tap linked into the feed) →
pace line. Rough-patch variant per proto copy; trigger = the shared detector (J15). Push
qualifiers: the three proto examples define the class; quiet-hours crossing only for true
user-actionable deadlines, gently phrased.

## Guardrails & data
The never-list is enforced by code + tests (extending the existing no-engagement-bait
guard). Caps enforced server-side. Digest opens/clicks are NOT optimization targets
(healthy-engagement rule). All delivery behind H2's flag; in-app until flipped.

## Acceptance
1. The digest renders from live feed-brief data (one source of truth — test: digest text
   equals brief text for the same state); all three personas per proto.
2. Rough-patch fires on the shared detector, in both channels (email + in-app brief).
3. The push classifier scores 100% on a fixture set of banned examples; caps + quiet hours
   are state-tested.
4. Tests (ratchet): unit — classifier, caps, detector reuse; E2E — daily + rough + push
   personas. Invariants green (engagement-bait paths impossible).

## Non-goals
New notification surfaces · digest personalization beyond feed mirroring (v2) · SMS.

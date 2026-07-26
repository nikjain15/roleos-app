# Design PRD, Role workspace (the decision room)

> Status: **APPROVED design → READY to build** (human approved 2026-07-04, design-depth loop).
> Visual + microcopy source of truth: **https://roleos.fyi/proto/role-workspace/** (4 personas)
> · decisions: https://roleos.fyi/proto/role-workspace/decisions.html
> The workspace exists (slice 5 Phase A + W4 compare/notes/bulk-dismiss), this reshapes it
> from a sortable list into a paced decision room. Reuse the machinery; change the shape.

## 1 · Problem & goal

Today /roles is a capable list; deciding on it is self-directed and unbounded. Goal: a
queue-shaped room where RO's sourcing meets your judgment at the plan's pace, "five need
your call this week," each about a minute, with a real finish line. Success: queue
completion rate · decision latency · share of passes that carry reasons. Healthy-engagement
family; an emptied queue that sends the user away happy is the ideal session.

## 2 · Confirmed intent (human-signed, 2026-07-04)

A decision queue leads, never infinite, sized by the plan's pace, with a celebrated,
defended finish line. Each role page puts her verdict first, call, honest why, gaps labeled
bridgeable-or-stretch, with pursue/pass right beneath and the posting + notes one optional
tap below. Compare is a tie-breaker with a dense table's soul: offered at genuine ties,
summonable for any 2–3, her lean citing what you've taught her. Passing is free and
undoable; explaining is warmly encouraged and immediately rewarded with a visible
re-weighting. Pursuing visibly starts her work, every step human-gated. The full list stays
browsable beneath, pruned by her, never by you.

## 3 · Behavior spec (copy verbatim from the prototype)

**The queue (top of /roles):** derived from plan pace (agenda machinery exists): batch size
~5/week, ranked so time-sensitive roles come first. Progress shown ("2 of 5 done"). Backlog
growth never guilts ("your list grew to 14, you still only need to decide on five").
Finish: celebration + defense of rest + the next batch's named day. Batch rhythm is
deliberate (rhythm > raw freshness); truly time-sensitive roles may jump in with a stated
reason.

**Role page:** verdict block first (call + why + "you'd be interviewing them as much as
they interview you" candor) · gaps with bridgeable/stretch labels and what she'll do about
bridgeable ones · pursue/pass buttons directly beneath · full posting (with
the-lines-that-matter highlighted) and per-role notes (W4) as collapsed sections.

**Pursue:** starts the crafting chain immediately and shows it: resume tailoring (tonight)
→ cover letter (after resume OK) → ready-to-send bundle (user presses send, Apply/Send's
domain). Queue advances. Cost valve (build-time flag): `batch_drafting`, if pursue-then-
abandon waste shows up in agent_runs, drafting can start at queue completion instead;
default OFF (immediate), the flag exists so it's a config flip.

**Compare:** entry: RO offers at genuine ties ("if the numbers settled it, I'd have settled
it, this is a taste call") OR user selects 2–3 (W4 machinery). Presentation: differences-
only dense table + "her lean" block that (a) cites the taste-model inference it relies on,
(b) links that citation to the originating decision event(s), verifiable, never
presumptuous, and (c) hands the call back. Ties can end in "pursue both."

**Pass:** one tap, instant, undo available. Optional why: chips (pay / company / level /
just a vibe) + free text ("say it your way"). Any reason given → immediate visible payoff
("Noted, you want to build, not polish. That just re-weighted how I rank for you.").
Bulk dismiss (W4) stays for stale batches.

## 4 · Data & guardrails

- Decision events: pursue, pass, pass-reason (free text = highest weight), compare
  invocations + picks, undo. Pass-reasons visibly affect subsequent ranking (re-rank
  consideration on next batch build).
- **Human gate:** pursue triggers drafting only; nothing outbound. Send remains Apply/Send's
  explicitly-clicked path.
- Honesty: gaps always labeled; her lean always cites a linkable basis; pay provenance
  labels carried from Explore; batch-jump roles state their reason.
- Warm-copy bar on every string (standing rule). RLS; `zod`; drafting calls metered.

## 5 · Acceptance criteria (Definition of Done)

1. Queue derives from plan pace; progress, backlog-no-guilt, finish-line celebration + named
   next batch all behave per proto at 375/768/1280, axe-clean.
2. Role page: verdict-first layout with actions beneath; posting/notes collapsed; gap labels
   render from real match reasoning.
3. Pursue starts the chain, shows it, advances the queue; `batch_drafting` flag exists and
   works; drafting metered to agent_runs.
4. Compare: tie-offer fires on genuinely-close matches (define: fit within N points +
   conflicting dimension winners); table renders differences; her lean cites + links its
   taste-model basis; user-summoned compare works for any 2–3.
5. Pass: instant + undo; reasons (chip/free-text) write correctly-weighted decision events;
   the payoff line reflects the actual re-weighting applied; bulk dismiss preserved.
6. **Tests (ratchet, net-new):** unit: batch construction (size, ranking, time-sensitive
   jump-in w/ reason); pass-reason weighting; tie-detection rule. E2E: full queue cycle
   (open → decide 5 → finish line); pursue chain visibility; compare via both entries;
   pass + undo + reason payoff. Invariant suites stay green.

## 6 · Non-goals

The send itself + bundle review (Apply/Send, next design) · Explore's discovery surface ·
tracker stages (post-send) · re-architecting matching/ranking (exists; this consumes it).

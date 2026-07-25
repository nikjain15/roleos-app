# X9 - Reply desk: scheduling + follow-up autopilot (drafts only) (PRD)

> Roadmap v2, "raise the bar" table (`docs/specs/roadmap-v2.md`). Suggested order was
> T2 → X10 → **X9** → X11; T2 and X10 are merged. Needs: Gate-2 Gmail/Calendar (live),
> `lib/followups.ts` (`suggestFollowups`), the recruiter route (`scan` / `draft_reply` /
> `draft_screening` over `agent/skills/gate2/recruiter_reply`) - all exist. First commit
> of `v2/x9-reply-desk`. **Spec-only: no build until approved.**

## Problem

The funnel's biggest *silent* drop is after a recruiter replies. A thread goes live -
"can you do Tuesday?", "share your availability", "any questions before we proceed?" - and
then it stalls: the user is mid-hunt, the reply waits a day, momentum and goodwill leak,
and warm live threads quietly die of slow scheduling and missed follow-ups. Today RO can
*scan* recruiter mail and *draft a reply* on demand, but nothing watches the threads,
notices which ones are waiting on the user, proposes concrete times, or surfaces the
follow-up that's now overdue. The work is reactive and per-thread; the drop-off is
systemic. Best-in-world bar: the user opens one "reply desk", sees every thread that needs
them ranked by urgency, and each already has a drafted reply (with real, conflict-free
calendar slots where scheduling is the ask) - one human click to send, nothing sent
without it.

## Goals

1. **One surface (`/reply-desk`):** every recruiter/hiring thread that is *waiting on the
   user*, one list ranked by SLA urgency (soonest-due first). Each row: who/company/role
   (linked to the tracker), the last inbound message, why it needs the user now
   (scheduling ask · question · overdue follow-up · thank-you window), and the drafted
   response ready to review.
2. **Scheduling that proposes real slots:** when the inbound is a scheduling ask, the
   drafted reply offers concrete times computed from `calendarUpcoming` (conflict-free,
   within the user's stated working hours, honoring timezone) - not "let me check my
   calendar". The user edits/approves; **the actual send is their click** (Gmail draft →
   human send, as Gate-2 already works). No calendar event is created until a time is
   agreed and the user confirms.
3. **Follow-up + thank-you autopilot (drafts only):** the SLA engine (`suggestFollowups`)
   already knows which threads are overdue for a nudge and which interviews just happened;
   X9 turns those into *queued drafts* on the desk (a calm follow-up, an interview
   thank-you) instead of a notification the user has to act on from scratch.
4. **Momentum without pressure:** ranked by "who's been waiting longest / due soonest",
   shown as work remaining, never a countdown; clearing the desk is the goal, an empty
   desk says what RO is watching for next. Wellbeing-first copy (acknowledge → truth →
   forward) on every line, including empty and error states.

## Non-goals

- **No autonomous send. Ever.** X9 detects, ranks, and drafts; every reply, thank-you, and
  follow-up leaves only on the user's click through the existing Gate-2 Gmail draft→send
  path. Human-gated-outward is untouched - a "send all" or auto-reply toggle would gut it
  and does not exist.
- **No auto-booking.** Proposed slots are *proposals inside a draft*; no calendar event is
  written speculatively. Event creation (if any) is a separate, later, explicitly-confirmed
  step - out of scope here.
- **No new model surface for classification we already have.** Reuse the recruiter
  `scan`/`draft_reply` skill; X9 orchestrates and schedules around it, it does not fork a
  parallel reply model.
- No new email vendor, no IMAP, no background polling loop beyond the existing Gate-2 read
  scopes and the existing digest/cron cadence.

## Approach (reuse-first)

- **`GET /reply-desk` (server page, Gate-2 gated):** for a connected user, read recent
  threads via `gmailRecent`, join to tracker roles/applications, and assemble desk rows.
  Users without Gate-2 connected get an honest "connect Gmail to turn on the reply desk"
  state - never a broken page.
- **`lib/reply-desk.ts` (pure, the testable core):** `assembleDesk(threads, followups,
  calendar, rolesById)` →️ ranked `DeskRow[]`. Pure functions decide: which threads are
  *waiting on the user* (last message inbound, not yet replied), the row's **reason**
  (`scheduling` · `question` · `followup_overdue` · `thankyou`), SLA urgency ordering, and
  - the key invariant kept in data - **`sendable` is always false at assembly time; a row
  only ever carries a *draft*, never a send authorization.** Slot proposal
  (`proposeSlots(calendar, prefs)`) is pure over the fetched calendar: conflict-free,
  working-hours-bounded, N soonest options, timezone-correct.
- **Drafting:** reuse the recruiter route's `draft_reply` (and a `draft_followup` /
  `draft_thankyou` variant of the same skill) to fill each row's draft; scheduling rows
  get the proposed slots interpolated. Drafts are stored the same way Gate-2 drafts are
  today (Gmail draft), so "send" is the identical existing human click.
- **`ReplyDeskClient`:** list + per-row review/edit/approve; keyboard-first like the
  ready-room (review one, act, next), `aria-live` progress, no countdowns. Actions call
  existing routes; approve = create/confirm the Gmail draft and hand to the user's send.
- **Entries:** a feed card when the desk is non-empty ("N threads waiting on you"); a
  tracker header link; the existing digest already mentions replies - extend its copy to
  deep-link the desk (small follow-up, not a new notification path).

## Truth / wellbeing gates (must hold)

- Every outbound is human-clicked (send path unchanged from Gate-2). Assembled rows are
  never `sendable`.
- Proposed times are conflict-checked against the *real* fetched calendar; never propose a
  slot that overlaps an existing event or falls outside stated working hours.
- Copy runs acknowledge → truth → forward on every state (row, empty desk, Gmail-not-
  connected, fetch error). A stalled thread is framed as "worth a nudge", never a failure.
- Reads are RLS-scoped and bounded; no cross-user thread leakage (live RLS probe required).

## Test plan (ratchet)

- **Unit (`lib/reply-desk.ts`):** waiting-on-user detection (inbound-last vs replied-last);
  reason classification for each of the 4 kinds; SLA ordering (soonest-due first,
  stable); `proposeSlots` conflict-avoidance + working-hours + timezone + empty-calendar;
  the **`sendable === false` invariant** on every assembled row.
- **Live E2E:** honest not-connected state; desk renders + ranks a seeded thread set;
  scheduling row shows conflict-free slots that avoid a seeded event; **approve creates a
  Gmail *draft* and sends nothing** (assert no message sent without the explicit click);
  follow-up/thank-you rows appear from SLA data; cross-user RLS probe.
- Ratchet the vitest / live-E2E / public counts vs merged main in the AUDIT-LOG entry, per
  loop convention.

## Deferrals (call out, don't silently cut)

- Actual calendar-event creation on agreement (a confirmed, separate write) - not here.
- Multi-round scheduling negotiation ("none of those work, how about…") - v1 proposes;
  re-proposal is a follow-up slice.
- Non-Gmail providers - Gate-2 scope only for now.

## Open questions for approval

1. Working-hours/timezone source: reuse the existing profile/goal prefs, or add a minimal
   scheduling-prefs field? (Lean: reuse; add only if absent.)
2. Slot count + horizon defaults (e.g. 3 options within the next 5 business days)?
3. Should thank-you drafts be opt-in per interview or always queued on the desk?

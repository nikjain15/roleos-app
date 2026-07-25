# X7 - Weekly strategy review (PRD)

## Problem

The hunt generates signal all week - sends, silences, screens, dismissals - but nobody steps
back. Users either grind without adjusting (the pivot they need is invisible in the daily noise)
or spiral on one rejection. The pace engine knows the numbers; nothing turns them into a candid
weekly READ: what's working, what isn't, what to change, what to focus on next week.

## Goals

1. A **weekly review**: pace vs plan, what worked, what didn't, ≤3 recommended pivots (each with
   the why), and a ≤3-item next-week focus - in RO's candid, wellbeing-aware voice.
2. **On demand + stored**: the user runs it when they want (their click = the model call); the
   latest review persists and re-renders free. History rides `notifications` (kind
   `weekly_review`) - no new tables.
3. **Wellbeing over engagement** (invariant): a heavy week gets "you've done plenty - rest";
   a quiet week gets normalized, never guilted. Pivot advice is proposed, never auto-applied.

## Non-goals

- Automatic weekly delivery (email/push is H2's flag; the cron hookup is a follow-up one-liner).
- Changing the goal/plan itself (pivots link to /goal - the user decides).
- Multi-week trend charts (v1 is this week's read; history accumulates for later).

## Approach

- **`lib/weekly-review.ts`** - `buildReviewState(userId)`: last-7-days activity from
  `applications.stage_history` (sends, advances, rejections), decision_events (curation volume,
  app_score events when present), current goal + plan verdict + weekly target vs actual, supply
  (pursue/maybe counts). Deterministic, bounded reads.
- **Skill `weekly_review`** - reason tier, full gate, `tools: []`, structured:
  `{headline, pace_read, working[≤3], not_working[≤3], pivots[{change, why}≤3],
  next_week[≤3], wellbeing_note}` - grounded ONLY in the state; explicit no-guilt rules.
- **`/api/review`** - GET: latest stored review (RLS). POST: rate-limited (2/h, `rate_events`),
  builds state → runs skill (metered) → stores as `notifications` kind `weekly_review` → returns.
- **`/review` page** - renders the latest review; "Run my weekly review" button; honest empty
  state for a brand-new hunt. Every pivot links to the screen where the user would act.

## Guardrails

Human-gated (click-to-run; pivots proposed, never applied); no transport; grounded-only prose
через the full quality gate; metered; rate-limited; RLS everywhere; zod on POST-adjacent input
(none beyond auth - POST takes no body).

## Acceptance criteria

1. A user with a week of tracker/curation activity clicks run → headline, pace read, ≥1 working /
   not-working item, ≤3 pivots with whys, next-week focus - grounded in their real numbers.
2. The review persists: GET + page reload render the stored review without a model call.
3. Brand-new user → honest "not enough signal yet" state (no fabricated review), still 200.
4. Unauth 401; >2 runs/hour 429 (no model spend); wellbeing note present when volume is high.

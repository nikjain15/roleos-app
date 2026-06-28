/**
 * The notification decision engine (journey.html §10, architecture.md §9).
 * RO EARNS the right to interrupt. This pure function decides, for any candidate
 * notification, which of four tiers it lands in — respecting the user's cadence,
 * quiet hours, the weekend rule, and hard rate caps. It is the single place the
 * wellbeing rules live, so the ambient agent (later) just calls it.
 *
 * North star (ro-voice): optimize for the user landing well and being okay, NOT
 * time-in-app. Engagement bait is BANNED IN CODE — certain kinds can never push,
 * never even surface as an interruption. There is deliberately no "you haven't
 * logged in" path anywhere.
 */

export type NotifTier = "push" | "digest" | "in_feed" | "never";

/** What kind of thing happened. */
export type NotifKind =
  | "deadline" // interview tomorrow, take-home due, recruiter waiting N days
  | "recruiter_reply" // a human is waiting on you
  | "draft_ready" // RO drafted something for your judgment
  | "new_matches" // RO found roles
  | "progress" // routine "what RO did"
  | "win" // an offer, a pass to the next round
  // ⛔ engagement-bait kinds — present ONLY so the engine can refuse them:
  | "reengagement_guilt"
  | "streak_loss"
  | "unread_count"
  | "generic_nudge";

/** Kinds that are pure engagement bait. These can NEVER notify. (journey §10) */
export const BANNED_KINDS: ReadonlySet<NotifKind> = new Set<NotifKind>([
  "reengagement_guilt",
  "streak_loss",
  "unread_count",
  "generic_nudge",
]);

export type Cadence = "realtime" | "daily" | "weekly" | "open";

export interface NotifSettings {
  /** The one user setting (journey §10). Default: daily digest. */
  cadence: Cadence;
}

export interface QuietHours {
  /** Local hour [0–23] quiet starts (default 21) and ends (default 8). */
  start: number;
  end: number;
  /** No weekend interruptions unless the user opts in (default true = off). */
  weekendsOff: boolean;
}

export const DEFAULT_NOTIF_SETTINGS: NotifSettings = { cadence: "daily" };
export const DEFAULT_QUIET_HOURS: QuietHours = { start: 21, end: 8, weekendsOff: true };

/** Hard caps so push stays rare (journey §10: ~1/day, ~3/week). */
export const PUSH_CAP_PER_DAY = 1;
export const PUSH_CAP_PER_WEEK = 3;

export interface NotifCandidate {
  kind: NotifKind;
  /** Only the user can act on it (an interview, a reply, a send). */
  userActionable: boolean;
  /** A real, time-bound deadline (not manufactured urgency). */
  timeSensitive: boolean;
}

export interface NotifContext {
  settings: NotifSettings;
  quiet: QuietHours;
  /** Local hour [0–23] now. */
  localHour: number;
  isWeekend: boolean;
  pushesSentToday: number;
  pushesSentThisWeek: number;
}

export interface NotifDecision {
  tier: NotifTier;
  /** Plain reason (for the admin trace + tests). */
  reason: string;
  /** A deadline that breaks quiet hours is still phrased gently. */
  gentle: boolean;
}

/** Quiet-hours check with wrap-around (e.g. 21→8 spans midnight). */
export function inQuietHours(hour: number, q: QuietHours): boolean {
  if (q.start === q.end) return false;
  return q.start < q.end
    ? hour >= q.start && hour < q.end // same-day window
    : hour >= q.start || hour < q.end; // wraps past midnight
}

/**
 * Decide the tier for a candidate notification. Layered: ban → intrinsic tier →
 * cadence → quiet hours → weekend → caps. A real user-actionable deadline is the
 * ONLY thing that breaks quiet hours / weekends / caps (and even then, gently).
 */
export function decideNotification(c: NotifCandidate, ctx: NotifContext): NotifDecision {
  // 1 · engagement bait can never notify — banned in code.
  if (BANNED_KINDS.has(c.kind)) {
    return { tier: "never", reason: "engagement-bait kind is banned", gentle: false };
  }

  const hardDeadline = c.timeSensitive && c.userActionable;

  // 2 · intrinsic ceiling by importance.
  let tier: NotifTier = hardDeadline ? "push" : c.userActionable ? "digest" : "in_feed";

  // 3 · the user's cadence reshapes everything below a hard deadline.
  if (!hardDeadline) {
    switch (ctx.settings.cadence) {
      case "open": // "only when I open" — never interrupt
        tier = "in_feed";
        break;
      case "weekly":
      case "daily": // batch non-urgent into the digest
        tier = c.userActionable ? "digest" : "in_feed";
        break;
      case "realtime": // more immediate, but routine still just sits in the feed
        tier = c.userActionable ? "push" : "in_feed";
        break;
    }
  } else if (ctx.settings.cadence === "open") {
    // The user asked for zero interruptions — honor it even for a deadline; it
    // still shows the moment they open the app.
    return { tier: "in_feed", reason: "cadence 'open' — no interruptions, ever", gentle: true };
  }

  // Only push is an interruption; the rest never trip quiet hours / caps.
  if (tier !== "push") {
    return { tier, reason: `tier '${tier}' is not an interruption`, gentle: false };
  }

  let gentle = false;

  // 4 · quiet hours — only a hard deadline breaks them (gently).
  if (inQuietHours(ctx.localHour, ctx.quiet)) {
    if (!hardDeadline) {
      return { tier: "digest", reason: "quiet hours — held for the digest", gentle: false };
    }
    gentle = true;
  }

  // 5 · weekend rule — same: deadline breaks through gently, else hold.
  if (ctx.isWeekend && ctx.quiet.weekendsOff) {
    if (!hardDeadline) {
      return { tier: "digest", reason: "weekend quiet — held for the digest", gentle: false };
    }
    gentle = true;
  }

  // 6 · rate caps — push stays rare; a hard deadline overrides (you must know).
  const overCap =
    ctx.pushesSentToday >= PUSH_CAP_PER_DAY || ctx.pushesSentThisWeek >= PUSH_CAP_PER_WEEK;
  if (overCap && !hardDeadline) {
    return { tier: "digest", reason: "push cap reached — held for the digest", gentle: false };
  }

  return {
    tier: "push",
    reason: hardDeadline ? "time-sensitive + user-actionable" : "realtime user-actionable",
    gentle,
  };
}

/**
 * The gamified feed's motivation math (docs/specs/feed-gamified.md) — streak,
 * momentum, and the week-dot row, derived from the SAME append-only
 * decision_events that already exist. Pure + deterministic: `today` and event
 * timestamps are passed in (no Date.now() here) so it's fully unit-testable and
 * timezone is the caller's choice.
 *
 * Healthy-engagement only (design-system §wellbeing): a streak counts DAYS THE
 * USER MADE A REAL MOVE — not visits. It never shames a break.
 */

export interface FeedEvent {
  created_at: string; // ISO
  weight?: number | null;
  kind?: string | null;
}

/** ISO datetime → YYYY-MM-DD in the given IANA tz (default UTC). */
export function dayKey(iso: string, tz = "UTC"): string {
  const d = new Date(iso);
  // en-CA yields YYYY-MM-DD; the tz option shifts to local calendar day.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** YYYY-MM-DD one day earlier (UTC-safe string math). */
export function prevDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** The set of calendar days (YYYY-MM-DD) on which the user made at least one move. */
export function activeDays(events: FeedEvent[], tz = "UTC"): Set<string> {
  const s = new Set<string>();
  for (const e of events) if (e.created_at) s.add(dayKey(e.created_at, tz));
  return s;
}

/**
 * Consecutive days (ending today, or yesterday if today's move isn't in yet) on
 * which the user made a move. A day with no move but whose yesterday was active
 * keeps the streak ALIVE until the day ends — the way health apps do it.
 */
export function computeStreak(active: Set<string>, today: string): number {
  let cursor = active.has(today) ? today : prevDay(today);
  let n = 0;
  while (active.has(cursor)) {
    n++;
    cursor = prevDay(cursor);
  }
  return n;
}

/** Weighted moves made today = the momentum number. Falls back to a count of 1/event. */
export function momentumToday(events: FeedEvent[], today: string, tz = "UTC"): number {
  let sum = 0;
  for (const e of events) {
    if (dayKey(e.created_at, tz) === today) sum += typeof e.weight === "number" && e.weight > 0 ? e.weight : 1;
  }
  return Math.round(sum);
}

export interface WeekDot {
  date: string; // YYYY-MM-DD
  label: string; // single-letter weekday
  active: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/** The trailing 7-day row ending today (oldest → today) for the streak dots. */
export function weekRow(active: Set<string>, today: string): WeekDot[] {
  const days: string[] = [];
  let cursor = today;
  for (let i = 0; i < 7; i++) {
    days.unshift(cursor);
    cursor = prevDay(cursor);
  }
  const L = ["S", "M", "T", "W", "T", "F", "S"];
  return days.map((date) => {
    const [y, m, d] = date.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { date, label: L[wd], active: active.has(date), isToday: date === today, isFuture: date > today };
  });
}

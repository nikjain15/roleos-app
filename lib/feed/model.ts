import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeDays,
  computeStreak,
  momentumToday,
  weekRow,
  dayKey,
  prevDay,
  type FeedEvent,
  type WeekDot,
} from "@/lib/feed/streak";

/**
 * The gamified feed's data model (docs/specs/feed-gamified.md). Derives the
 * motivation layer — streak · momentum · weekly pace · the path — from data that
 * ALREADY exists (decision_events, applications, matches). No new tables.
 * Pure math is split out (computePath, weeklyMoves) so it's unit-tested.
 */

export interface PathMilestone {
  key: "found" | "applied" | "interviewing" | "finals" | "offer";
  label: string;
  count: number;
  done: boolean;
  current: boolean;
}

// application.stage → which milestone it counts toward (cumulative frontier).
const APPLIED = new Set(["applied", "screening", "interviewing", "onsite", "offer"]);
const INTERVIEWING = new Set(["screening", "interviewing", "onsite", "offer"]);
const FINALS = new Set(["onsite", "offer"]);
const OFFER = new Set(["offer"]);

/** Pure: stage counts → the 5-stop path with the current frontier marked. */
export function computePath(input: {
  found: number;
  stages: string[]; // each application's stage
}): PathMilestone[] {
  const c = {
    found: input.found,
    applied: input.stages.filter((s) => APPLIED.has(s)).length,
    interviewing: input.stages.filter((s) => INTERVIEWING.has(s)).length,
    finals: input.stages.filter((s) => FINALS.has(s)).length,
    offer: input.stages.filter((s) => OFFER.has(s)).length,
  };
  const stops: PathMilestone[] = [
    { key: "found", label: "Found", count: c.found, done: c.found > 0, current: false },
    { key: "applied", label: "Applied", count: c.applied, done: c.applied > 0, current: false },
    { key: "interviewing", label: "Interviewing", count: c.interviewing, done: c.interviewing > 0, current: false },
    { key: "finals", label: "Finals", count: c.finals, done: c.finals > 0, current: false },
    { key: "offer", label: "Offer", count: c.offer, done: c.offer > 0, current: false },
  ];
  // current = the furthest stop that has any count (the frontier).
  const lastDone = stops.reduce((acc, s, i) => (s.done ? i : acc), -1);
  if (lastDone >= 0) stops[lastDone].current = true;
  return stops;
}

/** Pure: moves made in the trailing 7 days vs the 7 before that → the pace ratio. */
export function weeklyMoves(
  events: FeedEvent[],
  today: string,
  tz = "UTC",
): { thisWeek: number; lastWeek: number; ratio: number | null } {
  // build the two windows as day-key sets
  const windowDays = (endInclusive: string, n: number) => {
    const s = new Set<string>();
    let cur = endInclusive;
    for (let i = 0; i < n; i++) {
      s.add(cur);
      cur = prevDay(cur);
    }
    return s;
  };
  const cur7 = windowDays(today, 7);
  let prevEnd = today;
  for (let i = 0; i < 7; i++) prevEnd = prevDay(prevEnd);
  const prev7 = windowDays(prevEnd, 7);

  let thisWeek = 0;
  let lastWeek = 0;
  for (const e of events) {
    const k = dayKey(e.created_at, tz);
    if (cur7.has(k)) thisWeek++;
    else if (prev7.has(k)) lastWeek++;
  }
  const ratio = lastWeek > 0 ? Number((thisWeek / lastWeek).toFixed(1)) : null;
  return { thisWeek, lastWeek, ratio };
}

export interface FeedStats {
  streak: number;
  week: WeekDot[];
  momentum: number;
  movesToday: number; // count (not weighted) — drives the "N of 3 today" ring
  pace: { thisWeek: number; lastWeek: number; ratio: number | null };
  path: PathMilestone[];
}

/**
 * Load the motivation layer for a user. `today` is the caller's calendar day
 * (YYYY-MM-DD) in `tz` — the page computes it once so server + client agree.
 */
export async function loadFeedStats(
  db: SupabaseClient,
  userId: string,
  today: string,
  tz = "UTC",
): Promise<FeedStats> {
  // 60 days of moves is plenty for a 7-day streak + weekly pace.
  const since = (() => {
    let c = today;
    for (let i = 0; i < 60; i++) c = prevDay(c);
    return `${c}T00:00:00Z`;
  })();

  const [{ data: events }, { data: apps }, { count: matchCount }] = await Promise.all([
    db.from("decision_events").select("created_at, weight, kind").gte("created_at", since).order("created_at", { ascending: false }),
    db.from("applications").select("stage").eq("user_id", userId),
    db.from("matches").select("role_id", { count: "exact", head: true }),
  ]);

  const evs = (events ?? []) as FeedEvent[];
  const active = activeDays(evs, tz);

  return {
    streak: computeStreak(active, today),
    week: weekRow(active, today),
    momentum: momentumToday(evs, today, tz),
    movesToday: evs.filter((e) => dayKey(e.created_at, tz) === today).length,
    pace: weeklyMoves(evs, today, tz),
    path: computePath({ found: matchCount ?? 0, stages: (apps ?? []).map((a) => (a as { stage: string }).stage) }),
  };
}

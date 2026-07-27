import { supabaseService } from "@/lib/supabase/service";
import { runSkill } from "@/agent/skills/run";
import weeklyReviewSkill from "@/agent/skills/weekly_review";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";

/**
 * X7 — weekly strategy review. Gathers the user's REAL last-7-days signal
 * (sends, stage moves, curation, scores, pace vs plan) into a compact state,
 * has RO write the candid review through the full gate, and stores it as a
 * notification (kind `weekly_review`) — history accumulates, the latest
 * renders free. Server-only; every read bounded; nothing sends.
 */

export interface WeeklyReview {
  headline: string;
  pace_read: string;
  working: string[];
  not_working: string[];
  pivots: Array<{ change: string; why: string }>;
  next_week: string[];
  wellbeing_note: string;
}

const DAY_MS = 86_400_000;

export interface ReviewState {
  week_of: string;
  goal: { target: string | null; deadline: string | null; verdict: string | null; weekly_apps_target: number | null } | null;
  last7: {
    sends: number;
    stage_advances: number;
    rejections: number;
    curation_events: number;
    scores: Array<{ score: number; likelihood: string }>;
  };
  pipeline: { pursue: number; maybe: number; applied_total: number; interviewing: number; offers: number };
  enough_signal: boolean;
}

/** Deterministic, bounded snapshot of the week. Exported for tests via `now`. */
export async function buildReviewState(userId: string, now = new Date()): Promise<ReviewState> {
  const db = supabaseService();
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();

  const [{ data: apps }, { data: events }, { data: goal }, { data: matches }] = await Promise.all([
    db.from("applications").select("stage, stage_history, sent_at").eq("user_id", userId).limit(500),
    db
      .from("decision_events")
      .select("kind, action, payload, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(1000),
    db.from("goals").select("target, deadline_date, plan").eq("user_id", userId).eq("status", "active").maybeSingle(),
    db.from("matches").select("recommendation, status").eq("user_id", userId).limit(1000),
  ]);

  const history = (apps ?? []).flatMap(
    (a) => (a.stage_history as Array<{ stage: string; at: string }> | null) ?? [],
  );
  const recent = history.filter((h) => h.at >= since);
  const sends = recent.filter((h) => h.stage === "applied").length;
  const rejections = recent.filter((h) => h.stage === "rejected").length;
  const stageAdvances = recent.filter((h) => !["applied", "rejected", "withdrawn", "saved"].includes(h.stage)).length;

  const evs = events ?? [];
  const scores = evs
    .filter((e) => e.kind === "app_score")
    .map((e) => {
      const p = (e.payload ?? {}) as { score?: number; likelihood?: string };
      return { score: p.score ?? 0, likelihood: p.likelihood ?? "medium" };
    })
    .slice(0, 10);

  const m = matches ?? [];
  const stageCount = (s: string) => (apps ?? []).filter((a) => a.stage === s).length;
  const plan = (goal?.plan ?? null) as { feasibility?: { verdict?: string }; weekly?: { applications?: number } } | null;
  const target = (goal?.target ?? null) as { seniority?: string; archetype?: string } | null;

  const curationEvents = evs.filter((e) => e.kind === "match").length;
  const enough = sends + stageAdvances + rejections + curationEvents + scores.length >= 3;

  return {
    week_of: now.toISOString().slice(0, 10),
    goal: goal
      ? {
          target: [target?.seniority, target?.archetype].filter(Boolean).join(" ") || null,
          deadline: (goal.deadline_date as string | null) ?? null,
          verdict: plan?.feasibility?.verdict ?? null,
          weekly_apps_target: plan?.weekly?.applications ?? null,
        }
      : null,
    last7: { sends, stage_advances: stageAdvances, rejections, curation_events: curationEvents, scores },
    pipeline: {
      pursue: m.filter((x) => x.recommendation === "pursue" && x.status !== "dismissed").length,
      maybe: m.filter((x) => x.recommendation === "maybe" && x.status !== "dismissed").length,
      applied_total: stageCount("applied"),
      interviewing: stageCount("screening") + stageCount("interviewing") + stageCount("onsite"),
      offers: stageCount("offer"),
    },
    enough_signal: enough,
  };
}

/** Run the review for one user and persist it. Null when there's not enough signal. */
export async function buildAndStoreReview(userId: string): Promise<WeeklyReview | null> {
  const state = await buildReviewState(userId);
  if (!state.enough_signal) return null; // honest: no fabricated review off noise

  const { verdict, routing } = await runSkill(weeklyReviewSkill, { userId, data: { state } });
  await logAgentRuns(userId, verdict.runs, { skill: "weekly_review", judge: verdict, routing });
  const review = parseModelJson<WeeklyReview>(verdict.finalOutput);
  if (!review?.headline || !Array.isArray(review.pivots)) return null;

  const db = supabaseService();
  await db.from("notifications").insert({
    user_id: userId,
    kind: "weekly_review",
    tier: "in_feed",
    title: review.headline,
    body: review.pace_read,
    payload: { ...review, week_of: state.week_of },
    status: "unread",
  });
  return review;
}

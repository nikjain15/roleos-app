import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { planFor, type GoalRow } from "@/lib/goal";
import { computeRates } from "@/lib/plan/rates";
import { observedFromApplications, type AppLike } from "@/lib/plan/observed";
import { buildPaceNudge } from "@/lib/pace-nudge";
import {
  decideNotification,
  DEFAULT_NOTIF_SETTINGS,
  DEFAULT_QUIET_HOURS,
  type NotifSettings,
  type QuietHours,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Goal-anchored pace nudges (Slice 9, goal-engine §8). Called by the dedicated
 * cron worker. For each user with an ACTIVE goal, recomputes the plan and — ONLY
 * if they're off pace with a concrete lever — creates a wellbeing-gated `pace`
 * notification (never for inactivity/streaks). Throttled to ≤1 per 48h/user via
 * `profiles.ambient.last_nudge_at`. Secret-gated; service-role; no send.
 */
const MAX_PER_RUN = 25;
const THROTTLE_MS = 48 * 3_600_000;

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = env().CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = supabaseService();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const isWeekend = now.getUTCDay() === 0 || now.getUTCDay() === 6;
  const localHour = now.getUTCHours(); // best-effort (no per-user tz yet)

  const { data: goals } = await db
    .from("goals")
    .select("*")
    .eq("status", "active")
    .limit(500)
    .returns<GoalRow[]>();

  let created = 0;
  let scanned = 0;
  for (const goal of (goals ?? []).slice(0, MAX_PER_RUN)) {
    scanned++;
    const uid = goal.user_id;

    // Throttle: at most one nudge per 48h.
    const { data: profile } = await db
      .from("profiles")
      .select("notif_settings, quiet_hours, ambient")
      .eq("id", uid)
      .single<{
        notif_settings: NotifSettings | null;
        quiet_hours: QuietHours | null;
        ambient: { last_nudge_at?: string } | null;
      }>();
    const last = profile?.ambient?.last_nudge_at ? Date.parse(profile.ambient.last_nudge_at) : 0;
    if (last && now.getTime() - last < THROTTLE_MS) continue;

    // Per-user plan (service-role reads, filtered by user_id).
    const [{ count: supply }, { data: apps }] = await Promise.all([
      db.from("matches").select("role_id", { count: "exact", head: true })
        .eq("user_id", uid).in("recommendation", ["pursue", "maybe"]),
      db.from("applications").select("stage, stage_history").eq("user_id", uid).returns<AppLike[]>(),
    ]);
    const rates = computeRates(observedFromApplications(apps ?? []));
    const plan = planFor(goal, supply ?? 0, rates, today);

    const nudge = buildPaceNudge(plan, goal.deadline_hard);
    if (!nudge) continue; // on track / no deadline → RO stays quiet

    const decision = decideNotification(nudge.candidate, {
      settings: (profile?.notif_settings ?? DEFAULT_NOTIF_SETTINGS) as NotifSettings,
      quiet: (profile?.quiet_hours ?? DEFAULT_QUIET_HOURS) as QuietHours,
      localHour,
      isWeekend,
      pushesSentToday: 0,
      pushesSentThisWeek: 0,
    });
    if (decision.tier === "never") continue;

    await db.from("notifications").insert({
      user_id: uid,
      kind: "pace",
      tier: decision.tier,
      title: nudge.title,
      body: JSON.stringify({ lever: plan.feasibility.bestLever, message: plan.feasibility.message }),
      payload: { verdict: plan.feasibility.verdict, deadline: plan.deadline, gentle: decision.gentle },
      status: "unread",
    });
    await db
      .from("profiles")
      .update({ ambient: { ...(profile?.ambient ?? {}), last_nudge_at: now.toISOString() } })
      .eq("id", uid);
    created++;
  }

  return NextResponse.json({ ok: true, scanned, created });
}

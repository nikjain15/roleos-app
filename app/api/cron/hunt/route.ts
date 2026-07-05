import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import {
  huntForUser,
  huntSummary,
  isHuntDue,
  isDormant,
  HUNT_DRAFTS_PER_USER,
  type HuntAmbient,
} from "@/lib/hunt";
import { budgetLevel, dailyBudgetUsd } from "@/lib/cost-budget";
import {
  decideNotification,
  DEFAULT_NOTIF_SETTINGS,
  DEFAULT_QUIET_HOURS,
  type NotifSettings,
  type QuietHours,
} from "@/lib/notifications";
import { logInfo, logWarn, errorFields } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The overnight autonomous hunt (slice X1, docs/specs/x1-overnight-hunt.md).
 * Fired nightly by the dedicated cron worker. For each eligible user — active
 * goal, usable profile, not paused, not dormant, ≤1 hunt per 20h — re-matches
 * against the live corpus, pre-drafts truth-gated résumés for the top fresh
 * pursues, queues them in the Tracker, and leaves ONE digest-tier note. No
 * send anywhere; every model call metered; the whole run stands down when the
 * 24h cost budget is exceeded. Secret-gated; service-role.
 */
const MAX_USERS_PER_RUN = 8;
const MAX_DRAFTS_PER_RUN = 8;
const SOFT_DEADLINE_MS = 240_000;

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = env().CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Optional scope: {only_user_id} restricts the sweep to one user (manual /
  // targeted runs; the nightly worker sends no body → full sweep). Lenient on
  // an absent/empty body, strict on a malformed one.
  let onlyUserId: string | undefined;
  let draftCap = HUNT_DRAFTS_PER_USER;
  const raw = await req.text();
  if (raw.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    const parsed = z
      .object({
        only_user_id: z.string().uuid().optional(),
        // Scoped runs may narrow the per-user cap (manual/test runs); the
        // nightly full sweep always uses the standard cap.
        draft_cap: z.number().int().min(1).max(HUNT_DRAFTS_PER_USER).optional(),
      })
      .safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
    onlyUserId = parsed.data.only_user_id;
    if (onlyUserId) draftCap = parsed.data.draft_cap ?? draftCap;
  }

  const db = supabaseService();
  const started = Date.now();
  const now = new Date();

  // H5 tie-in: a hunt is discretionary spend — stand down over budget.
  const since = new Date(started - 24 * 3_600_000).toISOString();
  const { data: spendRows } = await db.from("agent_runs").select("cost_usd").gte("created_at", since).limit(5000);
  const spend = (spendRows ?? []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  if (budgetLevel(spend, dailyBudgetUsd()) === "exceeded") {
    logWarn("hunt.skipped_budget", { spend_24h_usd: Math.round(spend * 100) / 100 });
    return NextResponse.json({ ok: true, skipped: "budget_exceeded", hunted: 0 });
  }

  const { data: goals } = await db
    .from("goals")
    .select("user_id")
    .eq("status", "active")
    .limit(500);
  let userIds = [...new Set((goals ?? []).map((g) => g.user_id as string))];
  if (onlyUserId) userIds = userIds.filter((id) => id === onlyUserId);

  let hunted = 0;
  let draftsTotal = 0;
  let deferred = 0;

  for (const uid of userIds) {
    if (hunted >= MAX_USERS_PER_RUN || draftsTotal >= MAX_DRAFTS_PER_RUN) {
      deferred++;
      continue;
    }
    if (Date.now() - started > SOFT_DEADLINE_MS) {
      deferred++;
      continue;
    }

    const { data: profile } = await db
      .from("profiles")
      .select("notif_settings, quiet_hours, ambient")
      .eq("id", uid)
      .single<{
        notif_settings: NotifSettings | null;
        quiet_hours: QuietHours | null;
        ambient: HuntAmbient | null;
      }>();
    if (!isHuntDue(profile?.ambient, started)) continue;

    const { data: ev } = await db
      .from("decision_events")
      .select("created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isDormant(ev?.created_at ?? null, started)) continue;

    hunted++;
    try {
      const result = await huntForUser(db, uid, Math.min(draftCap, MAX_DRAFTS_PER_RUN - draftsTotal));
      draftsTotal += result.drafts.length;

      if (result.drafts.length > 0) {
        // One calm note about real work done — the engine picks the tier
        // (draft_ready is never a push storm; default cadence lands it in the digest).
        const decision = decideNotification(
          { kind: "draft_ready", userActionable: true, timeSensitive: false },
          {
            settings: (profile?.notif_settings ?? DEFAULT_NOTIF_SETTINGS) as NotifSettings,
            quiet: (profile?.quiet_hours ?? DEFAULT_QUIET_HOURS) as QuietHours,
            localHour: now.getUTCHours(),
            isWeekend: now.getUTCDay() === 0 || now.getUTCDay() === 6,
            pushesSentToday: 0,
            pushesSentThisWeek: 0,
          },
        );
        if (decision.tier !== "never") {
          const { title, body } = huntSummary(result.drafts);
          await db.from("notifications").insert({
            user_id: uid,
            kind: "draft_ready",
            tier: decision.tier,
            title,
            body,
            payload: { source: "overnight_hunt", drafts: result.drafts, errors: result.errors },
            status: "unread",
          });
        }
      }
      logInfo("hunt.user_done", {
        user_id: uid,
        saved: result.recomputed.saved,
        drafts: result.drafts.length,
        errors: result.errors,
      });
    } catch (err) {
      // No usable profile / recompute failure — skip quietly, try again next night.
      logWarn("hunt.user_skipped", { user_id: uid, ...errorFields(err) });
    } finally {
      // Stamp even on failure so a broken profile can't retry-storm the budget.
      const { data: p2 } = await db.from("profiles").select("ambient").eq("id", uid).single();
      await db
        .from("profiles")
        .update({ ambient: { ...((p2?.ambient as HuntAmbient | null) ?? {}), last_hunt_at: now.toISOString() } })
        .eq("id", uid);
    }
  }

  // No silent caps: say when a night couldn't reach everyone (next night catches up).
  if (deferred > 0) logInfo("hunt.deferred", { deferred, hunted, drafts: draftsTotal });

  return NextResponse.json({ ok: true, scanned: userIds.length, hunted, drafts: draftsTotal, deferred });
}

import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";
import { recomputeMatchesForUser } from "@/lib/recompute-matches";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Backfill: re-match EVERY user who has a saved profile against the current
 * pipeline. This is how a recall/matching improvement reaches users who already
 * onboarded (their shortlist was frozen at signup). Secret-gated (x-cron-secret,
 * same as the digest cron) so it can run headlessly or from a one-off trigger;
 * service-role, sequential, capped per run. No send capability.
 */
const MAX_PER_RUN = 25;

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = env().CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = supabaseService();
  const { data: profiles, error } = await db.from("master_profile").select("user_id").limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = [...new Set((profiles ?? []).map((r) => r.user_id as string))].slice(0, MAX_PER_RUN);

  const results: Array<{ user: string; saved?: number; pursue?: number; error?: string }> = [];
  for (const uid of userIds) {
    try {
      const r = await recomputeMatchesForUser(db, uid);
      results.push({ user: uid, saved: r.saved, pursue: r.pursue });
    } catch (e) {
      results.push({ user: uid, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}

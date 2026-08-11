import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";
import { collectForUser } from "@/lib/presence/collect";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Presence collection tick (the inbound half of the system). Called hourly by
 * the cron worker; each enabled source carries its own interval_hours (default
 * 24), so most ticks poll nothing and the fill-rate rule can shorten a hot
 * source to 4-hourly without a deploy. Replaces the launchd job on the
 * laptop — this is what makes Presence work with the laptop shut.
 *
 * Secret-gated; service-role; fetch + rank only. Phase 1 runs NO model and
 * drafts nothing; the human writes every comment (human-gated outward).
 * Unset API_DIRECT_KEY = the whole endpoint no-ops, cheaply and visibly.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = env().CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const apiKey = env().API_DIRECT_KEY;
  if (!apiKey) return NextResponse.json({ skipped: "API_DIRECT_KEY not set" });

  const db = supabaseService();

  // Users with at least one enabled source (single-digit user count in
  // practice; revisit the bound if that ever changes).
  const { data: rows, error } = await db
    .from("presence_sources")
    .select("user_id")
    .eq("enabled", true)
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))].slice(0, 25);

  const results: Record<string, unknown> = {};
  for (const uid of userIds) {
    try {
      const r = await collectForUser(db, uid, apiKey);
      results[uid] = r ?? "nothing-due";
    } catch (e) {
      results[uid] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({ users: userIds.length, results });
}

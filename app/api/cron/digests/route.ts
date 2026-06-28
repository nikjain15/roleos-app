import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";
import { buildAndStoreDigest, isDigestDue } from "@/lib/digest";
import { DEFAULT_NOTIF_SETTINGS, type Cadence } from "@/lib/notifications";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The ambient scheduler's work endpoint (journey.html §10). Called by the
 * dedicated cron worker (sandbox-style separate worker, so the live app worker
 * is untouched). Scans users, and for each who is DUE — per their cadence and
 * the self-quieting interval — builds + stores a digest. buildAndStoreDigest
 * no-ops cheaply (one count query, no model call) for users with nothing to say,
 * so this stays light. Secret-gated; service-role; no send.
 *
 * Capped per run (then hourly) to stay within subrequest limits — a Queue /
 * Workflow can scale this later if the user base grows.
 */
const MAX_PER_RUN = 25;

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = env().CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = supabaseService();
  const now = Date.now();

  // Candidates = users who have at least one match (distinct user_ids).
  const { data: rows } = await db.from("matches").select("user_id").limit(2000);
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))].slice(0, MAX_PER_RUN);

  let built = 0;
  for (const uid of userIds) {
    const { data: p } = await db
      .from("profiles")
      .select("notif_settings, ambient")
      .eq("id", uid)
      .single();
    const cadence = ((p?.notif_settings as { cadence?: Cadence } | null)?.cadence ??
      DEFAULT_NOTIF_SETTINGS.cadence) as Cadence;
    const lastDigestAt = (p?.ambient as { last_digest_at?: string } | null)?.last_digest_at ?? null;

    const { data: ev } = await db
      .from("decision_events")
      .select("created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!isDigestDue(cadence, lastDigestAt, ev?.created_at ?? null, now)) continue;
    const content = await buildAndStoreDigest(uid);
    if (content) built++;
  }

  return NextResponse.json({ scanned: userIds.length, built });
}

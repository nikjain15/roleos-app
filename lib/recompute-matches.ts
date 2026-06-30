import type { SupabaseClient } from "@supabase/supabase-js";
import { matchProfile } from "@/lib/run-match";

/**
 * Recompute a user's matches from their saved profile and persist them.
 *
 * WHY THIS EXISTS: matching used to run ONLY at onboarding, so every user's
 * shortlist was frozen at signup — a recall improvement (or a freshly ingested,
 * better-fit role) could never reach someone who already onboarded. This is the
 * re-match path: the feed's "refresh", an admin/cron backfill, and the way any
 * future matching change actually reaches people.
 *
 * Pass an RLS-scoped client (the user re-matching themselves via /api/rematch)
 * or the service client (a backfill over many users). Matches the user has
 * ACTED on (status != 'new') are preserved; only untouched auto-matches are
 * refreshed, so a recompute never erases the user's own decisions.
 */
export async function recomputeMatchesForUser(
  db: SupabaseClient,
  userId: string,
): Promise<{ saved: number; pursue: number; scanned: number }> {
  const { data: mp, error } = await db
    .from("master_profile")
    .select("data")
    .eq("user_id", userId)
    .single();
  if (error || !mp) throw new Error(`no master_profile for ${userId}: ${error?.message ?? "missing"}`);

  const raw = (mp.data as { raw?: string } | null)?.raw;
  if (!raw || raw.trim().length < 30) throw new Error("master_profile has no usable raw text");

  const { matches, scanned } = await matchProfile(raw, 8);
  if (!matches.length) return { saved: 0, pursue: 0, scanned };

  // Clear stale auto-matches (untouched ones only), then write the fresh set.
  // Preserves any role the user saved/dismissed/etc. so re-matching is safe.
  const fresh = new Set(matches.map((m) => m.id));
  const { data: existing } = await db
    .from("matches")
    .select("role_id")
    .eq("user_id", userId)
    .eq("status", "new");
  const staleIds = (existing ?? [])
    .map((r) => (r as { role_id: string }).role_id)
    .filter((id) => !fresh.has(id));
  if (staleIds.length) {
    await db.from("matches").delete().eq("user_id", userId).eq("status", "new").in("role_id", staleIds);
  }

  const rows = matches.map((m) => ({
    user_id: userId,
    role_id: m.id,
    fit_score: m.fit,
    reasoning: { why: m.why },
    gaps: m.gaps,
    recommendation: m.recommendation,
    status: "new",
  }));
  const { error: upErr } = await db.from("matches").upsert(rows, { onConflict: "user_id,role_id" });
  if (upErr) throw new Error(`matches upsert: ${upErr.message}`);

  // append-only event — keeps the taste-model substrate honest about refreshes.
  await db.from("decision_events").insert({
    user_id: userId,
    kind: "rematch",
    action: "recompute",
    payload: { saved: rows.length, scanned },
  });

  return {
    saved: rows.length,
    pursue: matches.filter((m) => m.recommendation === "pursue").length,
    scanned,
  };
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { recomputeMatchesForUser } from "@/lib/recompute-matches";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Re-match the signed-in user against the current role pool with the current
 * matching pipeline. RLS-scoped (the cookie-bound client) — a user can only
 * recompute and write their OWN matches. This is the feed's "refresh" and the
 * reason any matching improvement reaches users who already onboarded.
 *
 * No send capability (human-gated-outward holds); reads global role data only.
 */
export async function POST(): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  try {
    const res = await recomputeMatchesForUser(supabase, user.id);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

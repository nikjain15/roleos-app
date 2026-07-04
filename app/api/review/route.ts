import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { buildAndStoreReview, type WeeklyReview } from "@/lib/weekly-review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * X7 — weekly strategy review API. GET returns the latest stored review
 * (RLS-scoped, free). POST runs a fresh one on the USER'S click: rate-limited
 * (2/h — it's a weekly ritual, not a slot machine), metered, stored. A user
 * without enough signal gets an honest not-enough-yet, still 200.
 */
const RUNS_PER_HOUR = 2;

async function underLimit(userId: string): Promise<boolean> {
  try {
    const db = supabaseService();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error } = await db
      .from("rate_events")
      .select("*", { count: "exact", head: true })
      .eq("scope", "weekly_review")
      .eq("subject", userId)
      .gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) >= RUNS_PER_HOUR) return false;
    await db.from("rate_events").insert({ scope: "weekly_review", subject: userId });
    return true;
  } catch {
    return true; // fail-open
  }
}

export async function GET(): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data } = await supabase
    .from("notifications")
    .select("payload, created_at")
    .eq("kind", "weekly_review")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ review: (data?.payload as WeeklyReview | null) ?? null, created_at: data?.created_at ?? null });
}

export async function POST(): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  if (!(await underLimit(user.id))) {
    return NextResponse.json(
      { error: "You've run the review twice this hour — it's a weekly ritual; the numbers need time to change." },
      { status: 429 },
    );
  }

  const review = await buildAndStoreReview(user.id);
  if (!review) {
    return NextResponse.json({
      review: null,
      message:
        "Not enough signal yet for an honest review — track a few applications or curate your shortlist this week, and I'll have a real read for you.",
    });
  }
  return NextResponse.json({ review });
}

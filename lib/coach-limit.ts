import { supabaseService } from "@/lib/supabase/service";

// X8: every coach action is a model call — budget the hour per user. 60 turns
// comfortably covers two long mocks; a runaway voice loop can't burn past it.
// Shared by /api/coach (prep kick + mock turns) and /api/coach/[id]/run
// (the async prep/debrief workers) so the budget stays one pool.
const COACH_CALLS_PER_HOUR = 60;

/** Count the hour and record this call. Fail-open: an outage never blocks practice. */
export async function underCoachLimit(userId: string): Promise<boolean> {
  try {
    const db = supabaseService();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error } = await db
      .from("rate_events")
      .select("*", { count: "exact", head: true })
      .eq("scope", "coach")
      .eq("subject", userId)
      .gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) >= COACH_CALLS_PER_HOUR) return false;
    await db.from("rate_events").insert({ scope: "coach", subject: userId });
    return true;
  } catch {
    return true; // fail-open: an outage never blocks practice
  }
}

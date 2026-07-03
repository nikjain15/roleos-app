import type { SupabaseClient } from "@supabase/supabase-js";
import { computePlan } from "@/lib/plan/plan";
import { computeRates } from "@/lib/plan/rates";
import type { Goal as EngineGoal, Plan } from "@/lib/plan/types";

/**
 * Server-side goal loading + plan compute (the DB-touching seam; the pure engine
 * lives in `lib/plan/*`). Reads the user's ONE active goal, sizes live supply from
 * their shortlist, and computes the pace/plan. RLS-scoped: every read is the
 * caller's own rows.
 *
 * Rates are priors for now (the tracker's real conversions arrive in Slice 3 — the
 * `applications` table); when it lands, derive `observed` here and pass it to
 * `computeRates`. Deterministic input `today` is passed by the caller.
 */
export interface GoalRow {
  id: string;
  user_id: string;
  target: EngineGoal["target"];
  deadline_date: string | null;
  deadline_hard: boolean;
  constraints: { visa?: string; dealbreakers?: string[]; must_haves?: string[] } | null;
  intensity: EngineGoal["intensity"] | null;
  also_open_to: Record<string, unknown> | null;
  status: string;
  plan: Plan | null;
  computed_at: string | null;
  updated_at: string;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Live matching-role supply for the funnel feasibility check. */
export async function liveSupply(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("matches")
    .select("role_id", { count: "exact", head: true })
    .in("recommendation", ["pursue", "maybe"]);
  return count ?? 0;
}

export function planFor(goal: GoalRow, supply: number, today = todayISO()): Plan {
  return computePlan(
    {
      target: goal.target ?? undefined,
      deadline_date: goal.deadline_date,
      deadline_hard: goal.deadline_hard,
      intensity: goal.intensity ?? undefined,
    },
    { today, liveSupply: supply, rates: computeRates() },
  );
}

/** The active goal + its (freshly computed) plan, or nulls when no goal is set. */
export async function loadActiveGoal(
  supabase: SupabaseClient,
): Promise<{ goal: GoalRow | null; plan: Plan | null }> {
  const { data: goal } = await supabase
    .from("goals")
    .select("*")
    .eq("status", "active")
    .maybeSingle<GoalRow>();
  if (!goal) return { goal: null, plan: null };
  const supply = await liveSupply(supabase);
  return { goal, plan: planFor(goal, supply) };
}

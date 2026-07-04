import type { SupabaseClient } from "@supabase/supabase-js";
import { computePlan } from "@/lib/plan/plan";
import { computeRates } from "@/lib/plan/rates";
import { observedFromApplications, type AppLike } from "@/lib/plan/observed";
import type { Goal as EngineGoal, Plan, Rates } from "@/lib/plan/types";

/**
 * Server-side goal loading + plan compute (the DB-touching seam; the pure engine
 * lives in `lib/plan/*`). Reads the user's ONE active goal, sizes live supply from
 * their shortlist, and computes the pace/plan. RLS-scoped: every read is the
 * caller's own rows.
 *
 * Rates blend priors with the user's REAL conversions from the tracker
 * (`applications.stage_history`, dimension 14). Deterministic input `today` is
 * passed by the caller.
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

export function planFor(goal: GoalRow, supply: number, rates?: Rates, today = todayISO()): Plan {
  return computePlan(
    {
      target: goal.target ?? undefined,
      deadline_date: goal.deadline_date,
      deadline_hard: goal.deadline_hard,
      intensity: goal.intensity ?? undefined,
    },
    { today, liveSupply: supply, rates: rates ?? computeRates() },
  );
}

/** Blended rates from the user's real application funnel (falls back to priors). */
export async function ratesFromTracker(supabase: SupabaseClient): Promise<Rates> {
  const { data } = await supabase
    .from("applications")
    .select("stage, stage_history")
    .limit(500)
    .returns<AppLike[]>();
  return computeRates(observedFromApplications(data ?? []));
}

/** Applications sent (reached 'applied') in the last 7 days — for agenda pacing. */
export async function appsThisWeek(supabase: SupabaseClient, today = todayISO()): Promise<number> {
  const weekAgo = new Date(new Date(today).getTime() - 7 * 86_400_000).toISOString();
  const { count } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", weekAgo);
  return count ?? 0;
}

/**
 * Recall query texts derived from the goal (slice W7 — "also open to" wiring).
 * The TARGET phrase anchors sourcing to what the user actually wants, and each
 * also_open_to entry widens recall WITHOUT its own pace (per the goals schema).
 * Pure — unit-tested; consumed by recomputeMatchesForUser as extra recall queries.
 */
export function goalQueryTexts(
  goal: Pick<GoalRow, "target" | "also_open_to"> | null | undefined,
): string[] {
  if (!goal) return [];
  const out: string[] = [];
  const t = goal.target ?? {};
  const targetPhrase = [t.seniority, t.archetype]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .join(" ")
    .trim();
  if (targetPhrase) out.push(targetPhrase.slice(0, 200));
  if (Array.isArray(t.domains)) {
    for (const d of t.domains.slice(0, 3)) {
      if (typeof d === "string" && d.trim() && targetPhrase) {
        out.push(`${targetPhrase} ${d.trim()}`.slice(0, 200));
      }
    }
  }
  const also = goal.also_open_to;
  if (also && typeof also === "object") {
    const text = (also as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 2) out.push(text.trim().slice(0, 300));
  }
  return [...new Set(out)];
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
  const [supply, rates] = await Promise.all([liveSupply(supabase), ratesFromTracker(supabase)]);
  return { goal, plan: planFor(goal, supply, rates) };
}

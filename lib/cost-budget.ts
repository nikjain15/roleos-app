import { supabaseService } from "@/lib/supabase/service";

/**
 * agent_runs cost-budget alerting (slice H5). After each metered write we
 * compare the rolling 24h spend against the budget and emit a structured
 * console line Workers Logs can alert on. Pure threshold logic is exported for
 * tests; the check is best-effort and throttled to at most once per Worker
 * isolate per 10 minutes (telemetry must never add real load).
 *
 * Budget: COST_BUDGET_DAILY_USD env (default $25/day — quality-first, but a
 * runaway loop should page someone long before it hurts).
 */
export const DEFAULT_DAILY_BUDGET_USD = 25;

export function dailyBudgetUsd(env: string | undefined = process.env.COST_BUDGET_DAILY_USD): number {
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_BUDGET_USD;
}

export type BudgetLevel = "ok" | "warn" | "exceeded";

/** Pure: where does spend sit against the budget? warn at 80%. */
export function budgetLevel(spendUsd: number, budgetUsd: number): BudgetLevel {
  if (spendUsd >= budgetUsd) return "exceeded";
  if (spendUsd >= budgetUsd * 0.8) return "warn";
  return "ok";
}

let lastCheckMs = 0;
const CHECK_EVERY_MS = 10 * 60_000;

/** Best-effort 24h spend check + structured alert line. Never throws. */
export async function checkCostBudget(now = Date.now()): Promise<void> {
  if (now - lastCheckMs < CHECK_EVERY_MS) return;
  lastCheckMs = now;
  try {
    const db = supabaseService();
    const since = new Date(now - 24 * 3600_000).toISOString();
    const { data } = await db.from("agent_runs").select("cost_usd").gte("created_at", since).limit(5000);
    const spend = (data ?? []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
    const budget = dailyBudgetUsd();
    const level = budgetLevel(spend, budget);
    if (level !== "ok") {
      console.warn(
        JSON.stringify({
          t: new Date(now).toISOString(),
          level: level === "exceeded" ? "error" : "warn",
          event: `cost_budget.${level}`,
          spend_24h_usd: Math.round(spend * 100) / 100,
          budget_usd: budget,
        }),
      );
    }
  } catch {
    /* telemetry never blocks or throws */
  }
}

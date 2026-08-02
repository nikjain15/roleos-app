import { supabaseService } from "@/lib/supabase/service";
import { checkCostBudget } from "@/lib/cost-budget";
import { checkQualityHealth } from "@/lib/quality-health";
import type { AgentRunRecord } from "@/agent/registry";
import type { GateVerdict } from "@/agent/quality-gate";
import type { RoutingTrace } from "@/agent/skills/run";

/**
 * Persist metered model calls to agent_runs (architecture.md §4.1: cost tracking
 * is in the call path, not optional). Service-role write — agent_runs has no
 * user write path and is admin-read only. Best-effort: a logging failure never
 * blocks the user-facing result.
 *
 * The quality-gate verdict (judge pass/fail + truth + critic) is attached so the
 * admin "Models & evals" surface sees gate pass-rates per run.
 *
 * When a `routing` trace is supplied it rides in the same `trace` jsonb (no
 * schema change): production can now see which tier answered, whether the answer
 * escalated, and the final confidence band: the routing decision is no longer
 * invisible. It is stamped on each row of the run so the tier path is queryable
 * alongside every metered hop.
 */
export async function logAgentRuns(
  userId: string | null,
  runs: AgentRunRecord[],
  meta: { skill: string; judge?: GateVerdict; routing?: RoutingTrace },
): Promise<void> {
  if (!runs.length) return;
  try {
    const db = supabaseService();
    const judge_verdict = meta.judge
      ? {
          status: meta.judge.status,
          truth: meta.judge.truth,
          critic: meta.judge.critic,
          // SH3: the confidence band is recorded on the row so the rolling
          // quality-health check (lib/quality-health.ts) can compute an
          // unknown-confidence rate. A prompt change can keep `status` passing
          // while collapsing confidence, and that is still RO getting worse.
          confidence: meta.judge.confidence,
          privacy: meta.judge.guardrails.privacy.status,
        }
      : null;
    const rows = runs.map((r) => {
      // Speed (SUQS) + the routing decision ride in the existing trace jsonb,
      // no schema change. latency is only written when callModel measured it.
      const trace: Record<string, unknown> = {};
      if (typeof r.latency_ms === "number") trace.latency_ms = r.latency_ms;
      if (meta.routing) trace.routing = meta.routing;
      return {
        user_id: userId,
        skill: r.skill ?? meta.skill,
        model: r.model,
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        cost_usd: r.cost_usd,
        stop_reason: r.stop_reason,
        trace: Object.keys(trace).length > 0 ? trace : null,
        judge_verdict,
      };
    });
    await db.from("agent_runs").insert(rows);
    await checkCostBudget(); // H5: rolling-24h budget alert (throttled, never throws)
    // SH3: rolling quality-health check. Emits a `quality_health.breached` line
    // when RO's own gate stops vouching for its output at the rate that means
    // something is wrong. Throttled, best-effort, never throws. Nothing pages on
    // it yet, and lib/quality-health.ts says so rather than implying otherwise.
    await checkQualityHealth();
  } catch {
    /* never block the user on telemetry */
  }
}

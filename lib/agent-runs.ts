import { supabaseService } from "@/lib/supabase/service";
import type { AgentRunRecord } from "@/agent/registry";
import type { GateVerdict } from "@/agent/quality-gate";

/**
 * Persist metered model calls to agent_runs (architecture.md §4.1: cost tracking
 * is in the call path, not optional). Service-role write — agent_runs has no
 * user write path and is admin-read only. Best-effort: a logging failure never
 * blocks the user-facing result.
 *
 * The quality-gate verdict (judge pass/fail + truth + critic) is attached so the
 * admin "Models & evals" surface sees gate pass-rates per run.
 */
export async function logAgentRuns(
  userId: string | null,
  runs: AgentRunRecord[],
  meta: { skill: string; judge?: GateVerdict },
): Promise<void> {
  if (!runs.length) return;
  try {
    const db = supabaseService();
    const judge_verdict = meta.judge
      ? { status: meta.judge.status, truth: meta.judge.truth, critic: meta.judge.critic }
      : null;
    const rows = runs.map((r) => ({
      user_id: userId,
      skill: r.skill ?? meta.skill,
      model: r.model,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      cost_usd: r.cost_usd,
      stop_reason: r.stop_reason,
      judge_verdict,
    }));
    await db.from("agent_runs").insert(rows);
  } catch {
    /* never block the user on telemetry */
  }
}

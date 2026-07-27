import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The routing decision must be OBSERVABLE in production: logAgentRuns persists
 * the RoutingTrace (difficulty + tier path + rerouted + final confidence) into
 * the existing agent_runs.trace jsonb, alongside the per-hop latency. No schema
 * change, no weakening of the service-role-only write path.
 */

const inserted: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/service", () => ({
  supabaseService: () => ({
    from: (_table: string) => ({
      insert: (rows: Array<Record<string, unknown>>) => {
        inserted.push(...rows);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

vi.mock("@/lib/cost-budget", () => ({ checkCostBudget: vi.fn(async () => {}) }));

import { logAgentRuns } from "@/lib/agent-runs";
import type { AgentRunRecord } from "@/agent/registry";
import type { RoutingTrace } from "@/agent/skills/run";

beforeEach(() => {
  inserted.length = 0;
});

const runs: AgentRunRecord[] = [
  {
    model: "claude-sonnet-4-6",
    input_tokens: 10,
    output_tokens: 20,
    cost_usd: 0.01,
    stop_reason: "end_turn",
    latency_ms: 42,
    skill: "draft_resume",
  },
  {
    model: "claude-opus-4-8",
    input_tokens: 30,
    output_tokens: 40,
    cost_usd: 0.05,
    stop_reason: "end_turn",
    latency_ms: 99,
    skill: "draft_resume",
  },
];

describe("agent_runs · routing trace is persisted", () => {
  it("writes the full RoutingTrace into trace.routing on every hop", async () => {
    const routing: RoutingTrace = {
      difficulty: "hard",
      tiers: ["draft", "reason"],
      rerouted: true,
      confidence: "weak",
    };
    await logAgentRuns("user-1", runs, { skill: "draft_resume", routing });

    expect(inserted).toHaveLength(2);
    for (const row of inserted) {
      const trace = row.trace as { latency_ms?: number; routing?: RoutingTrace };
      // The routing decision is now visible…
      expect(trace.routing).toEqual(routing);
      // …without clobbering the SUQS latency already carried in trace.
      expect(typeof trace.latency_ms).toBe("number");
    }
  });

  it("still logs (trace holds only latency) when no routing trace is supplied", async () => {
    await logAgentRuns("user-1", runs, { skill: "draft_resume" });
    expect(inserted).toHaveLength(2);
    const trace = inserted[0].trace as { latency_ms?: number; routing?: unknown };
    expect(trace.latency_ms).toBe(42);
    expect(trace.routing).toBeUndefined();
  });
});

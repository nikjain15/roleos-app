import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * getAdminStats derives the four SUQS numbers from agent_runs so quality is
 * OBSERVED, not asserted: Speed (median primary-output latency from trace),
 * Utility (null pre-traction), Quality (gate pass-rate), Scalability (call
 * volume + $/call). Sub-calls (skill contains ":") are excluded from Speed +
 * Quality just like the existing pass-rate logic.
 */

const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: () => ({
    from: () => ({ select: () => ({ order: () => ({ limit }) }) }),
  }),
}));

import { getAdminStats } from "@/lib/admin-stats";

beforeEach(() => limit.mockReset());

describe("admin SUQS · derived from agent_runs", () => {
  it("computes Speed (p50), Quality, Scalability and a null Utility", async () => {
    limit.mockResolvedValue({
      data: [
        // primary outputs (latency + verdict count)
        { skill: "match", model: "m", input_tokens: 100, output_tokens: 50, cost_usd: 0.1, judge_verdict: { status: "passed" }, trace: { latency_ms: 1000 }, created_at: "t3" },
        { skill: "match", model: "m", input_tokens: 100, output_tokens: 50, cost_usd: 0.3, judge_verdict: { status: "needs_your_eyes" }, trace: { latency_ms: 3000 }, created_at: "t2" },
        { skill: "draft", model: "m", input_tokens: 100, output_tokens: 50, cost_usd: 0.2, judge_verdict: { status: "passed" }, trace: { latency_ms: 2000 }, created_at: "t1" },
        // a sub-call — must NOT affect Speed or Quality
        { skill: "match:critic", model: "m", input_tokens: 10, output_tokens: 5, cost_usd: 0.05, judge_verdict: { status: "passed" }, trace: { latency_ms: 99999 }, created_at: "t0" },
      ],
    });

    const s = await getAdminStats();

    expect(s.suqs.speedMsP50).toBe(2000); // median of [1000,2000,3000], sub-call excluded
    expect(s.suqs.speedSamples).toBe(3);
    expect(s.suqs.utility).toBeNull();
    expect(s.suqs.qualityPassRate).toBe(67); // 2 of 3 primary passed
    expect(s.suqs.scaleRuns).toBe(4);
    expect(s.suqs.costPerRunUsd).toBeCloseTo(0.65 / 4, 6);
  });

  it("returns null Speed and cost when there are no runs", async () => {
    limit.mockResolvedValue({ data: [] });
    const s = await getAdminStats();
    expect(s.suqs.speedMsP50).toBeNull();
    expect(s.suqs.speedSamples).toBe(0);
    expect(s.suqs.costPerRunUsd).toBeNull();
    expect(s.suqs.qualityPassRate).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The end of the resilience ladder, at the runner level: when the provider is
 * genuinely down and the retries are spent, `runSkill` must NOT invent an
 * answer (RO fails honestly), and must NOT lose the money already spent. The
 * hops that were paid for are written to agent_runs on the way out, so the
 * rolling-24h budget guard (lib/cost-budget.ts) counts failed work too.
 */

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
const { logAgentRuns } = vi.hoisted(() => ({
  logAgentRuns: vi.fn(
    async (
      _userId: string | null,
      _runs: { input_tokens: number; output_tokens: number; cost_usd: number }[],
      _meta: { skill: string },
    ) => {},
  ),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

vi.mock("@/lib/env", () => ({
  env: () => ({ ANTHROPIC_API_KEY: "test-key" }),
}));

vi.mock("@/lib/agent-runs", () => ({ logAgentRuns }));

import { runSkill } from "@/agent/skills/run";
import { MeteredRunsError } from "@/agent/registry";
import { skill } from "@/agent/skills/skill";

const probe = skill({
  id: "resilience_probe",
  model: "draft",
  tools: [],
  gate: "full",
  prompt: () => ({ system: "s", user: "u" }),
});

function textResp(text: string) {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

beforeEach(() => {
  create.mockReset();
  logAgentRuns.mockClear();
});

describe("runSkill · a provider outage costs money and must still be metered", () => {
  it("banks the generation spend when the gate's own call dies, so retries cannot hide it from the daily budget", async () => {
    // Turn 1 (the generation) succeeds and is billed. The gate's critic call
    // then hits a non-retryable 401 and the ladder fails fast. The generation's
    // tokens were still spent.
    create
      .mockResolvedValueOnce(textResp("a draft"))
      .mockRejectedValue(Object.assign(new Error("HTTP 401"), { status: 401 }));

    const err = await runSkill(probe, { userId: "u1", data: {} }).catch((e) => e);

    expect(err).toBeInstanceOf(MeteredRunsError);
    expect(logAgentRuns).toHaveBeenCalledTimes(1);
    const [userId, runs, meta] = logAgentRuns.mock.calls[0];
    expect(userId).toBe("u1");
    expect(meta).toEqual({ skill: "resilience_probe" });
    expect(runs).toHaveLength(1);
    expect(runs[0].input_tokens).toBe(100);
    expect(runs[0].cost_usd).toBeGreaterThan(0);
  });

  it("does not fabricate an answer when the provider is down: the failure still travels up", async () => {
    create.mockRejectedValue(Object.assign(new Error("HTTP 400"), { status: 400 }));

    const err = await runSkill(probe, { userId: "u1", data: {} }).catch((e) => e);

    expect(err).toBeInstanceOf(MeteredRunsError);
    // Nothing was billed, so nothing is written, and no phantom spend either.
    expect(logAgentRuns).not.toHaveBeenCalled();
  });

  it("a healthy run is untouched by the resilience path: one call, one metered hop, no extra writes", async () => {
    create.mockResolvedValue(textResp("PASS"));

    const res = await runSkill(probe, { userId: "u1", data: {} });

    expect(res.verdict.status).toBe("passed");
    // The caller still owns success metering; runSkill only writes on failure.
    expect(logAgentRuns).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from "vitest";

/**
 * Dynamic difficulty-based routing for the primary answer path.
 *
 * These tests mock `callModel` (so no network/secret is touched) and assert the
 * MODEL actually chosen at each hop:
 *   • a gate-failing answer escalates draft -> reason (stronger tier);
 *   • a truth-gate failure escalates and re-runs on the stronger tier;
 *   • a trivial input takes the cheap fast path (draft -> quick_tag);
 *   • escalation is bounded, a gate that never passes cannot loop forever;
 *   • the sampling contract holds for every ladder tier.
 */

const OPUS = "claude-opus-4-8";
const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5";

function modelForJob(job: string): string {
  if (job === "reason" || job === "critic") return OPUS;
  if (job === "draft" || job === "code") return SONNET;
  return HAIKU; // quick_tag
}

function makeRun(job: string) {
  return {
    model: modelForJob(job),
    input_tokens: 10,
    output_tokens: 20,
    cost_usd: 0,
    stop_reason: "end_turn",
    latency_ms: 1,
  };
}

// Shared switches controlling when the critic/truth gate is satisfied.
//  • escalated  flips true once generation runs on the strong (reason) tier,
//                 simulating "the stronger tier produced a shippable answer".
//  • neverPass  is a hard override: the gate is never satisfied (bounded-loop test).
const state = { escalated: false, neverPass: false };

vi.mock("@/agent/registry", async (importActual) => {
  const actual = await importActual<typeof import("@/agent/registry")>();
  return {
    ...actual,
    callModel: vi.fn(
      async (job: string, call: { system?: string; prompt?: string }) => {
        if (job === "reason") state.escalated = true; // generation on the strong tier
        const system = call.system ?? "";

        const satisfied = state.escalated && !state.neverPass;
        // The LLM voice-critic (quality gate step 3).
        if (job === "critic" && /quality critic/i.test(system)) {
          return { text: satisfied ? "PASS" : "REVISE: too generic", run: makeRun(job) };
        }
        // The truth gate (fail-closed) returns a JSON verdict.
        if (job === "critic" && /truth gate/i.test(system)) {
          return {
            text: JSON.stringify(
              satisfied ? { ok: true, violations: [] } : { ok: false, violations: ["unsupported claim"] },
            ),
            run: makeRun(job),
          };
        }
        // Any generation / revise / repair call: return a clean, shape-valid answer.
        return { text: JSON.stringify({ answer: "grounded answer" }), run: makeRun(job) };
      },
    ),
  };
});

import { runSkill } from "@/agent/skills/run";
import { skill } from "@/agent/skills/skill";
import {
  classifyDifficulty,
  cheaperTier,
  strongerTier,
  tierJobForModel,
  pinModelFor,
  TIER_LADDER,
} from "@/agent/routing";
import { jobSpec } from "@/agent/registry";

// A minimal prose answer skill on the draft (Sonnet) tier.
const proseSkill = skill({
  id: "test_answer",
  model: "draft",
  tools: [],
  gate: "full",
  prompt: () => ({
    system: "You are RO. Answer warmly and honestly.",
    user: "Walk me through the full negotiation strategy for this offer and compare the trade-offs, and why?",
  }),
});

// A trivial prose skill: a short, marker-free prompt classifies as trivial.
const trivialSkill = skill({
  id: "test_trivial",
  model: "draft",
  tools: [],
  gate: "full",
  prompt: () => ({ system: "You are RO.", user: "How many roles are in my tracker?" }),
});

// A structured résumé-style skill with a truth gate (groundTruth supplied).
const structuredSkill = skill({
  id: "test_structured",
  model: "draft",
  tools: [],
  gate: "full",
  structured: true,
  expects: (t: string) => {
    try {
      JSON.parse(t);
      return true;
    } catch {
      return false;
    }
  },
  prompt: () => ({
    system: "You are RO, tailoring a résumé.",
    user: "Tailor my résumé to this senior role, reworking my real experience only.",
  }),
});

describe("dynamic routing · escalation up the ladder", () => {
  it("escalates draft -> reason when the quality gate keeps failing, then passes", async () => {
    state.escalated = false;
    const res = await runSkill(proseSkill, { userId: "u1", data: {} });

    expect(res.routing.tiers).toEqual(["draft", "reason"]);
    expect(res.routing.rerouted).toBe(true);
    expect(res.verdict.status).toBe("passed");
    // The final generation hop ran on the STRONGER tier (Opus).
    const genModels = res.verdict.runs.map((r) => r.model);
    expect(genModels).toContain(OPUS);
  });

  it("escalates on a truth-gate failure and re-runs on the stronger tier", async () => {
    state.escalated = false;
    const res = await runSkill(structuredSkill, {
      userId: "u1",
      data: { groundTruth: "Real master profile: PM at Acme, 2019-2023." },
    });

    expect(res.routing.tiers).toEqual(["draft", "reason"]);
    expect(res.verdict.status).toBe("passed");
    expect(res.verdict.truth?.ok).toBe(true);
    expect(res.verdict.runs.some((r) => r.model === OPUS)).toBe(true);
  });
});

describe("dynamic routing · cheap fast path", () => {
  it("routes a trivial input DOWN to the cheap tier (quick_tag / Haiku)", async () => {
    // Let the gate pass on the first (cheap) hop, so we can observe the fast path
    // without escalation kicking in.
    state.escalated = true;
    state.neverPass = false;
    const res = await runSkill(trivialSkill, { userId: "u1", data: {} });

    expect(classifyDifficulty("How many roles are in my tracker?")).toBe("trivial");
    expect(res.routing.difficulty).toBe("trivial");
    expect(res.routing.tiers[0]).toBe("quick_tag");
    expect(res.routing.tiers).toHaveLength(1); // passed on the cheap tier, no escalation
    expect(res.verdict.runs.some((r) => r.model === HAIKU)).toBe(true);
    expect(res.verdict.status).toBe("passed");
  });
});

describe("dynamic routing · escalation is bounded", () => {
  it("never loops past the top of the ladder even if the gate never passes", async () => {
    state.escalated = false;
    state.neverPass = true; // gate can never be satisfied on any tier
    const res = await runSkill(proseSkill, { userId: "u1", data: {} });
    state.neverPass = false;

    // draft -> reason, then reason is the top: it stops. No infinite loop.
    expect(res.routing.tiers).toEqual(["draft", "reason"]);
    expect(res.routing.tiers.length).toBeLessThanOrEqual(TIER_LADDER.length);
    expect(res.verdict.status).toBe("needs_your_eyes");
  });
});

describe("routing helpers · pure functions", () => {
  it("classifies difficulty deterministically", () => {
    expect(classifyDifficulty("How many roles do I have?")).toBe("trivial");
    expect(classifyDifficulty("Compare these two offers and explain the strategy and why.")).toBe(
      "hard",
    );
    expect(classifyDifficulty("x".repeat(2000))).toBe("hard");
    expect(
      classifyDifficulty(
        "Draft a note to the recruiter thanking them for the update and letting them know I am " +
          "still very interested in the role, that I have wrapped my current project, and that I can " +
          "start the interview loop whenever works best for their team over the next few weeks.",
      ),
    ).toBe("normal");
  });

  it("walks the ladder in both directions and stops at the ends", () => {
    expect(strongerTier("draft")).toBe("reason");
    expect(strongerTier("quick_tag")).toBe("draft");
    expect(strongerTier("reason")).toBeNull(); // top of the ladder
    expect(cheaperTier("draft")).toBe("quick_tag");
    expect(cheaperTier("reason")).toBe("draft");
    expect(cheaperTier("quick_tag")).toBeNull(); // bottom of the ladder
  });

  it("round-trips a pinned ModelRef back to its ladder job", () => {
    for (const job of TIER_LADDER) {
      expect(tierJobForModel(pinModelFor(job))).toBe(job);
    }
  });

  it("sampling contract: no ladder tier carries temperature and Haiku carries no effort", () => {
    for (const job of TIER_LADDER) {
      const params = (jobSpec(job).params ?? {}) as Record<string, unknown>;
      expect(params.temperature).toBeUndefined();
      expect(params.top_p).toBeUndefined();
      expect(params.top_k).toBeUndefined();
      expect(params.budget_tokens).toBeUndefined();
    }
    // Haiku 400s on `effort`, so the cheap tier must stay a plain call.
    expect((jobSpec("quick_tag").params ?? {}).effort).toBeUndefined();
  });
});

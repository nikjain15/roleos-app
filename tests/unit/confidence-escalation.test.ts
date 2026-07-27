import { describe, it, expect, vi } from "vitest";

/**
 * The escalation signal is now GRADED, not just binary. A gate verdict that
 * PASSES (never returns needs_your_eyes) but is graded WEAK confidence must still
 * escalate up the tier ladder, and must stay bounded at the top of the ladder.
 *
 * This mocks callModel so every judge is satisfied on every tier — the ONLY
 * thing keeping confidence off "strong" is a deliberately thin grounding slice.
 * So any escalation observed here is driven by the computed WEAK band, not by a
 * failed critic / truth gate.
 */

const OPUS = "claude-opus-4-8";
const SONNET = "claude-sonnet-4-6";

function modelForJob(job: string): string {
  if (job === "reason" || job === "critic") return OPUS;
  return SONNET; // draft
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

vi.mock("@/agent/registry", async (importActual) => {
  const actual = await importActual<typeof import("@/agent/registry")>();
  return {
    ...actual,
    callModel: vi.fn(async (job: string, call: { system?: string }) => {
      const system = call.system ?? "";
      // Every judge is satisfied on every tier — no failed gate anywhere.
      if (job === "critic" && /quality critic/i.test(system)) {
        return { text: "PASS", run: makeRun(job) };
      }
      if (job === "critic" && /truth gate/i.test(system)) {
        return { text: JSON.stringify({ ok: true, violations: [] }), run: makeRun(job) };
      }
      // Generation: a clean, shape-valid JSON answer.
      return { text: JSON.stringify({ answer: "grounded answer" }), run: makeRun(job) };
    }),
  };
});

import { runSkill } from "@/agent/skills/run";
import { skill } from "@/agent/skills/skill";

// A structured, grounded skill on the draft tier. Ground truth is supplied but
// deliberately THIN, so the pass is graded WEAK confidence.
const thinlyGroundedSkill = skill({
  id: "test_thin_grounding",
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

describe("graded confidence · a WEAK pass escalates (not only needs_your_eyes)", () => {
  it("escalates draft -> reason on a passing-but-weak verdict, and stops at the ladder top", async () => {
    const res = await runSkill(thinlyGroundedSkill, {
      userId: "u1",
      data: { groundTruth: "PM at Acme." }, // < GROUNDING_MIN_CHARS → thin
    });

    // The gate PASSED at every hop — escalation was driven purely by WEAK confidence.
    expect(res.verdict.status).toBe("passed");
    expect(res.verdict.confidence).toBe("weak");

    // It walked UP the ladder and stopped at the top (bounded, no loop).
    expect(res.routing.tiers).toEqual(["draft", "reason"]);
    expect(res.routing.rerouted).toBe(true);
    expect(res.routing.confidence).toBe("weak");
    expect(res.verdict.runs.some((r) => r.model === OPUS)).toBe(true);
  });

  it("a clean, well-grounded pass is STRONG and does NOT escalate", async () => {
    const res = await runSkill(thinlyGroundedSkill, {
      userId: "u1",
      data: {
        groundTruth:
          "Master profile: ".padEnd(600, "detailed real experience across product, growth, and platform. "),
      },
    });
    expect(res.verdict.status).toBe("passed");
    expect(res.verdict.confidence).toBe("strong");
    expect(res.routing.tiers).toEqual(["draft"]); // no escalation on a strong pass
  });
});

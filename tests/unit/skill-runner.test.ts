import { describe, it, expect, vi } from "vitest";

/**
 * Smoke test: a skill runs end-to-end through the quality gate, with callModel
 * mocked so no network/secret is needed. Proves the wiring:
 *   skill.prompt → callModel → quality gate → verdict.
 */
vi.mock("@/agent/registry", async (importActual) => {
  const actual = await importActual<typeof import("@/agent/registry")>();
  const run = {
    model: "mock",
    input_tokens: 10,
    output_tokens: 20,
    cost_usd: 0,
    stop_reason: "end_turn",
  };
  return {
    ...actual,
    callModel: vi.fn(async (job: string) => {
      if (job === "critic") return { text: "PASS", run };
      // draft/reason → a clean, on-voice, shape-valid résumé draft
      return {
        text: "Senior AI PM\n- Shipped LLM eval platform; cut hallucinations 40%\n- Led 0→1 launch",
        run,
      };
    }),
  };
});

import { runSkill } from "@/agent/skills/run";
import draftResume from "@/agent/skills/draft_resume";

describe("skill runner · end-to-end through the gate", () => {
  it("draft_resume passes the gate with clean output", async () => {
    const res = await runSkill(draftResume, {
      userId: "u1",
      data: { role: { role_title: "AI PM" }, masterProfile: { name: "Nik" } },
    });
    expect(res.skillId).toBe("draft_resume");
    expect(res.verdict.shapeOk).toBe(true);
    expect(res.verdict.status).toBe("passed");
    expect(res.verdict.runs.length).toBeGreaterThan(0); // critic run logged
  });
});

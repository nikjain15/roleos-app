import { describe, it, expect, vi } from "vitest";

/**
 * End-to-end wiring proof for the Conduit seam.
 *
 * The app's primary answer path (a skill run) now flows through @conduit/client
 * in EMBEDDED mode: runSkill → inferViaConduit → createClient({mode:"embedded"})
 * → the injected RoleOS core (callModel). The Anthropic provider is mocked, so
 * this asserts the WIRING, not the model. We also assert the unified client
 * surface directly: `mode`, `infer`, and `retrieve` (routed to role recall).
 */

// Mock the Anthropic-backed model path (the provider) so no key/network is used.
const run = {
  model: "claude-sonnet-4-6",
  input_tokens: 12,
  output_tokens: 34,
  cost_usd: 0.001,
  stop_reason: "end_turn",
  latency_ms: 5,
};

vi.mock("@/agent/registry", async (importActual) => {
  const actual = await importActual<typeof import("@/agent/registry")>();
  return {
    ...actual,
    callModel: vi.fn(async (job: string) => {
      if (job === "critic") return { text: "PASS", run: { ...run, model: "claude-opus-4-8" } };
      // The dock ask skill (ro_ask) returns strict JSON.
      return {
        text: JSON.stringify({
          answer: "You have 3 pursue-worthy roles queued; start with the Staff PM at Acme.",
          action: { label: "Open roles", href: "/roles" },
          act: null,
        }),
        run,
      };
    }),
  };
});

// Mock role recall so `retrieve` needs no DB/embeddings.
vi.mock("@/lib/match", () => ({
  recallRolesMulti: vi.fn(async (_queries: string[], limit: number) => ({
    poolSize: 557,
    candidates: [
      { id: "r1", company: "Acme", role_title: "Staff PM", archetype: "ai-pm", distance: 0.12 },
      { id: "r2", company: "Beta", role_title: "Senior PM", archetype: "ai-pm", distance: 0.2 },
    ].slice(0, limit),
  })),
}));

import { createRoleOsClient, inferViaConduit } from "@/agent/conduit";
import { callModel } from "@/agent/registry";
import { runSkill } from "@/agent/skills/run";
import roAsk from "@/agent/skills/ro_ask";

describe("conduit client · embedded seam", () => {
  it("exposes the unified embedded surface", () => {
    const client = createRoleOsClient();
    expect(client.mode).toBe("embedded");
    expect(typeof client.infer).toBe("function");
    expect(typeof client.retrieve).toBe("function");
  });

  it("infer flows app → @conduit/client (embedded) → RoleOS model, keeping the metered run", async () => {
    const result = await inferViaConduit("draft", { system: "sys", prompt: "hello" });
    // The answer came back through the client, and RoleOS's metered run survived.
    expect(result.text).toContain("Staff PM at Acme");
    expect(result.run.cost_usd).toBe(0.001);
    expect(result.run.input_tokens).toBe(12);
    // The provider was actually invoked with the mapped job.
    expect(callModel).toHaveBeenCalledWith("draft", expect.objectContaining({ prompt: "hello" }), undefined);
  });

  it("retrieve routes RoleOS role recall through the client", async () => {
    const client = createRoleOsClient();
    const { chunks, grounded } = await client.retrieve({ query: "ai product roles", topK: 2 });
    expect(grounded).toBe(true);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ id: "r1" });
    expect(chunks[0].text).toContain("Acme");
    // distance 0.12 → similarity 0.88
    expect(chunks[0].score).toBeCloseTo(0.88, 5);
  });

  it("the real dock answer path returns an answer through the seam and the gate", async () => {
    const { verdict } = await runSkill(roAsk, {
      userId: "u1",
      data: { question: "what should I do next?", screen: "/feed", state: { top_pursue: [] } },
    });
    const parsed = JSON.parse(verdict.finalOutput) as { answer: string };
    expect(parsed.answer).toContain("Staff PM at Acme");
    expect(verdict.status).toBe("passed");
  });
});

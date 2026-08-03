import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * The layered stop conditions on the tool loop (agent/stop.ts).
 *
 * MAX_TOOL_TURNS was the only bound. It did not bound cost, it did not notice
 * repetition, and when it tripped it returned the text of a `tool_use`
 * response, which is usually empty, so a cut-short run handed back nothing and
 * said nothing about why.
 *
 * The pure helpers are exercised directly; the loop is then driven with the SDK
 * mocked, because a budget that is computed and never consulted would pass
 * every test of the helpers alone.
 */

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

vi.mock("@/lib/env", () => ({
  env: () => ({ ANTHROPIC_API_KEY: "test-key" }),
}));

import { callModel } from "@/agent/registry";
import { budgetBreach, stopNotice, textWithNotice, toolStateKey } from "@/agent/stop";
import type { Tool } from "@/agent/tools";

function textResp(text: string) {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 5, output_tokens: 7 },
  };
}

/** A tool_use turn. `tokens` lets a test drive the budget deliberately. */
function toolUseResp(name: string, input: unknown, tokens = 10) {
  return {
    content: [{ type: "tool_use", id: `tu_${Math.abs(tokens)}`, name, input }],
    stop_reason: "tool_use",
    usage: { input_tokens: tokens, output_tokens: 0 },
  };
}

beforeEach(() => {
  create.mockReset();
});

const searchTool: Tool = {
  name: "search_roles",
  description: "search",
  schema: z.object({ query: z.string().min(1) }).strict() as unknown as Tool["schema"],
  jsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  run: vi.fn(async (input: unknown) => ({ echoed: (input as { query: string }).query })),
};

describe("budgetBreach", () => {
  it("is null with no budget, however much was spent", () => {
    expect(budgetBreach({ tokens: 1e9, costUsd: 1e6 }, undefined)).toBeNull();
  });

  it("trips at the token ceiling, inclusive", () => {
    expect(budgetBreach({ tokens: 999, costUsd: 0 }, { maxTokens: 1000 })).toBeNull();
    expect(budgetBreach({ tokens: 1000, costUsd: 0 }, { maxTokens: 1000 })).toBe(
      "token budget: 1000 of 1000 tokens used",
    );
  });

  it("trips at the cost ceiling, inclusive", () => {
    expect(budgetBreach({ tokens: 0, costUsd: 0.049 }, { maxCostUsd: 0.05 })).toBeNull();
    expect(budgetBreach({ tokens: 0, costUsd: 0.05 }, { maxCostUsd: 0.05 })).toContain("cost budget");
  });
});

describe("toolStateKey", () => {
  it("is insensitive to argument key order", () => {
    expect(toolStateKey("t", { a: 1, b: 2 }, "r")).toBe(toolStateKey("t", { b: 2, a: 1 }, "r"));
  });

  it("separates the same call with a different result", () => {
    // Why the result is part of the state: a tool that honestly returns
    // something new must not be mistaken for a loop.
    expect(toolStateKey("poll", { id: 1 }, "pending")).not.toBe(
      toolStateKey("poll", { id: 1 }, "done"),
    );
  });

  it("separates different tools with identical arguments and results", () => {
    expect(toolStateKey("a", { k: 1 }, "r")).not.toBe(toolStateKey("b", { k: 1 }, "r"));
  });
});

describe("stopNotice and textWithNotice", () => {
  it("is empty when the model finished on its own", () => {
    expect(stopNotice("completed", "", 3)).toBe("");
  });

  it("says how far the run got for every bound", () => {
    for (const stop of ["max_tool_turns", "budget_exhausted", "loop_detected"] as const) {
      expect(stopNotice(stop, "detail", 4)).toContain("Here is how far I got: 4 tool turns");
    }
  });

  it("makes the notice the answer when there is no partial text", () => {
    // The case that used to return "". An explanation beats an empty string.
    expect(textWithNotice("   ", "I stopped early.")).toBe("I stopped early.");
  });

  it("appends the notice to partial text rather than replacing it", () => {
    expect(textWithNotice("Partial answer.", "I stopped early.")).toBe(
      "Partial answer.\n\nI stopped early.",
    );
  });

  it("leaves text untouched when nothing tripped", () => {
    expect(textWithNotice("Done.", "")).toBe("Done.");
  });
});

describe("callModel stop conditions end a real loop", () => {
  it("halts on the token budget before the turn cap, and says so", async () => {
    // Every turn asks for a tool with a DIFFERENT query, so loop detection
    // cannot be what stops this. Only the budget can.
    for (let i = 0; i < 10; i++) {
      create.mockResolvedValueOnce(toolUseResp("search_roles", { query: `q${i}` }, 400));
    }

    const res = await callModel(
      "reason",
      { prompt: "spend" },
      {
        skill: "t",
        tools: [searchTool],
        toolContext: { userId: "u1" },
        runBudget: { maxTokens: 1200 },
      },
    );

    expect(res.loopStop).toBe("budget_exhausted");
    expect(res.notice).toContain("token budget");
    expect(res.text).toContain("Here is how far I got");
    // 400 tokens a turn, ceiling 1200: charged after the third, stopped there.
    expect(create).toHaveBeenCalledTimes(3);
    expect(res.run.input_tokens).toBe(1200);
  });

  it("halts when a tool returns an identical result for identical arguments", async () => {
    (searchTool.run as ReturnType<typeof vi.fn>).mockClear();
    // The stuck model: same query, every turn.
    for (let i = 0; i < 10; i++) {
      create.mockResolvedValueOnce(toolUseResp("search_roles", { query: "same" }));
    }

    const res = await callModel(
      "reason",
      { prompt: "circles" },
      { skill: "t", tools: [searchTool], toolContext: { userId: "u1" } },
    );

    expect(res.loopStop).toBe("loop_detected");
    expect(res.notice).toContain("repeating itself");
    // Caught on the repeat: two model turns, not the full seven.
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does NOT halt when the same call returns something new each time", async () => {
    // A tool whose answer legitimately moves. Keying on the call alone would
    // have killed this run.
    let tick = 0;
    const pollTool: Tool = {
      name: "poll_job",
      description: "poll",
      schema: z.object({}).strict() as unknown as Tool["schema"],
      jsonSchema: { type: "object", properties: {} },
      run: vi.fn(async () => ({ status: ++tick < 3 ? "pending" : "done", tick })),
    };

    create
      .mockResolvedValueOnce(toolUseResp("poll_job", {}))
      .mockResolvedValueOnce(toolUseResp("poll_job", {}))
      .mockResolvedValueOnce(toolUseResp("poll_job", {}))
      .mockResolvedValueOnce(textResp("The job finished."));

    const res = await callModel(
      "reason",
      { prompt: "wait" },
      { skill: "t", tools: [pollTool], toolContext: { userId: "u1" } },
    );

    expect(res.loopStop).toBe("completed");
    expect(res.notice).toBe("");
    expect(res.text).toBe("The job finished.");
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("does not treat a repeated tool ERROR as a loop", async () => {
    (searchTool.run as ReturnType<typeof vi.fn>).mockClear();
    create
      .mockResolvedValueOnce(toolUseResp("search_roles", { query: "" })) // fails min(1)
      .mockResolvedValueOnce(toolUseResp("search_roles", { query: "" })) // same failure
      .mockResolvedValueOnce(textResp("Recovered."));

    const res = await callModel(
      "reason",
      { prompt: "x" },
      { skill: "t", tools: [searchTool], toolContext: { userId: "u1" } },
    );

    // The error observation is the information the model needs to correct
    // itself, so the run must be allowed to reach the recovery.
    expect(res.loopStop).toBe("completed");
    expect(res.text).toBe("Recovered.");
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("explains itself at the turn cap instead of returning an empty string", async () => {
    (searchTool.run as ReturnType<typeof vi.fn>).mockClear();
    // Distinct queries so loop detection stays out of it, and no text block on
    // any turn: the exact shape that used to return "".
    for (let i = 0; i < 12; i++) {
      create.mockResolvedValueOnce({
        content: [{ type: "tool_use", id: `tu_${i}`, name: "search_roles", input: { query: `q${i}` } }],
        stop_reason: "tool_use",
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    }

    const res = await callModel(
      "reason",
      { prompt: "never finishes" },
      { skill: "t", tools: [searchTool], toolContext: { userId: "u1" } },
    );

    expect(res.loopStop).toBe("max_tool_turns");
    expect(res.text).not.toBe("");
    expect(res.text).toContain("tool-step limit");
    expect(res.notice).toContain("6 tool turns");
  });

  it("can turn loop detection off, and then only the turn cap catches it", async () => {
    (searchTool.run as ReturnType<typeof vi.fn>).mockClear();
    for (let i = 0; i < 12; i++) {
      create.mockResolvedValueOnce(toolUseResp("search_roles", { query: "same" }));
    }

    const res = await callModel(
      "reason",
      { prompt: "circles allowed" },
      {
        skill: "t",
        tools: [searchTool],
        toolContext: { userId: "u1" },
        detectLoops: false,
      },
    );

    expect(res.loopStop).toBe("max_tool_turns");
  });

  it("reports completed with no notice on the ordinary path", async () => {
    create.mockResolvedValueOnce(textResp("plain"));
    const res = await callModel("reason", { prompt: "hi" }, { skill: "t" });
    expect(res.loopStop).toBe("completed");
    expect(res.notice).toBe("");
    expect(res.text).toBe("plain");
  });
});

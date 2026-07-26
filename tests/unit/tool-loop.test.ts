import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * The real tool loop in callModel: when a skill hands the model DB-backed tools,
 * callModel must (1) advertise them to the SDK as `tools`, (2) execute each
 * `tool_use` block with zod-validated args, (3) feed a `tool_result` back, and
 * (4) accumulate token/cost across every turn. This proves the wiring end-to-end
 * with the Anthropic SDK + env mocked — no network, no secret, no DB.
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

import { callModel, type ModelResult } from "@/agent/registry";
import type { Tool } from "@/agent/tools";

function textResp(text: string) {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 5, output_tokens: 7 },
  };
}

function toolUseResp(name: string, input: unknown) {
  return {
    content: [{ type: "tool_use", id: "tu_1", name, input }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 3 },
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

describe("callModel · tool loop", () => {
  it("runs a tool, feeds the result back, and returns the final text", async () => {
    create
      .mockResolvedValueOnce(toolUseResp("search_roles", { query: "ai pm" }))
      .mockResolvedValueOnce(textResp("Here are the roles."));

    const res: ModelResult = await callModel(
      "reason",
      { prompt: "find roles" },
      { skill: "t", tools: [searchTool], toolContext: { userId: "u1" } },
    );

    // SDK called twice (tool turn + final turn); tool executed with valid args.
    expect(create).toHaveBeenCalledTimes(2);
    expect(searchTool.run).toHaveBeenCalledWith({ query: "ai pm" }, { userId: "u1" });
    expect(res.text).toBe("Here are the roles.");

    // First request advertised the tool; second carried the tool_result back.
    const firstReq = create.mock.calls[0][0];
    expect(firstReq.tools?.[0]?.name).toBe("search_roles");
    const secondReq = create.mock.calls[1][0];
    const toolResultTurn = secondReq.messages.at(-1);
    expect(toolResultTurn.role).toBe("user");
    expect(toolResultTurn.content[0].type).toBe("tool_result");
    expect(toolResultTurn.content[0].is_error).toBeUndefined();

    // Cost/tokens accumulated across BOTH turns; latency (SUQS Speed) recorded.
    expect(res.run.input_tokens).toBe(15);
    expect(res.run.output_tokens).toBe(10);
    expect(typeof res.run.latency_ms).toBe("number");
    expect(res.toolCalls).toEqual([
      { name: "search_roles", input: { query: "ai pm" }, ok: true, error: undefined },
    ]);
  });

  it("feeds a recoverable error back when the model sends invalid args", async () => {
    (searchTool.run as ReturnType<typeof vi.fn>).mockClear();
    create
      .mockResolvedValueOnce(toolUseResp("search_roles", { query: "" })) // fails min(1)
      .mockResolvedValueOnce(textResp("Recovered."));

    const res = await callModel(
      "reason",
      { prompt: "x" },
      { skill: "t", tools: [searchTool], toolContext: { userId: "u1" } },
    );

    // Bad args never reach run(); the model gets an is_error tool_result.
    expect(searchTool.run).not.toHaveBeenCalled();
    const secondReq = create.mock.calls[1][0];
    expect(secondReq.messages.at(-1).content[0].is_error).toBe(true);
    expect(res.toolCalls?.[0].ok).toBe(false);
    expect(res.text).toBe("Recovered.");
  });

  it("makes a plain (tool-free) call when no tools are passed", async () => {
    create.mockResolvedValueOnce(textResp("plain"));
    const res = await callModel("reason", { prompt: "hi" }, { skill: "t" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].tools).toBeUndefined();
    expect(res.toolCalls).toBeUndefined();
    expect(res.text).toBe("plain");
  });
});

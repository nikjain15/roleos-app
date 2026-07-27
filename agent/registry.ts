import Anthropic from "@anthropic-ai/sdk";
import registry from "./registry.json" assert { type: "json" };
import { env } from "@/lib/env";
import type { Tool, ToolContext } from "@/agent/tools";

/**
 * The model registry + the single `callModel(job, input)` path that every
 * Anthropic call in RO goes through. It resolves the job → model, calls the
 * raw Anthropic SDK, and returns text + a usage/cost record the caller writes
 * to `agent_runs`. Cost tracking is not optional — it's in the call path.
 *
 * Per the Claude API reference: Opus 4.8 / Sonnet 4.6 do NOT accept
 * temperature/top_p/top_k or budget_tokens (they 400). Depth is steered with
 * `output_config.effort` + adaptive thinking. Haiku takes neither — plain call.
 */

export type AnthropicJob = "reason" | "draft" | "code" | "quick_tag" | "critic";
export type Job = AnthropicJob | "embed";

interface JobSpec {
  description: string;
  provider: "anthropic" | "workers-ai";
  model: string;
  params?: {
    max_tokens?: number;
    effort?: "low" | "medium" | "high" | "max";
    thinking?: "adaptive";
  };
  dimensions?: number;
  cost_per_mtok: { input: number; output: number };
}

const JOBS = registry.jobs as Record<string, JobSpec>;

export function jobSpec(job: Job): JobSpec {
  const spec = JOBS[job];
  if (!spec) throw new Error(`Unknown registry job: ${job}`);
  return spec;
}

export interface ModelCall {
  system?: string;
  /** A single user turn. Multi-turn flows pass the full array instead. */
  prompt?: string;
  messages?: Anthropic.MessageParam[];
}

export interface ModelResult {
  text: string;
  run: AgentRunRecord;
  /** One entry per tool the model invoked during the loop (empty if none). */
  toolCalls?: ToolCallTrace[];
}

/** A single tool invocation the model made — captured for logging/eval. */
export interface ToolCallTrace {
  name: string;
  input: unknown;
  ok: boolean;
  /** Present when the call failed (bad args or the tool threw). */
  error?: string;
}

const MAX_TOOL_TURNS = 6;

/** The metered record for one model call — caller persists to `agent_runs`. */
export interface AgentRunRecord {
  skill?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  stop_reason: string | null;
  /** Wall-clock latency of the model call (summed across tool-loop turns), ms.
   *  The Speed leg of SUQS — persisted into agent_runs.trace by logAgentRuns. */
  latency_ms?: number;
}

function costUsd(spec: JobSpec, inTok: number, outTok: number): number {
  return (
    (inTok / 1_000_000) * spec.cost_per_mtok.input +
    (outTok / 1_000_000) * spec.cost_per_mtok.output
  );
}

/**
 * THE single Anthropic entry point. No skill talks to the SDK directly.
 * Deliberately has NO send capability — see architecture.md §6.
 */
export async function callModel(
  job: AnthropicJob,
  call: ModelCall,
  opts: {
    skill?: string;
    /**
     * Real tools handed to the model. When present, callModel runs a tool loop:
     * it executes each `tool_use` block the model emits (args validated by the
     * tool's zod schema; failures fed back as recoverable tool errors) and
     * continues until the model stops asking for tools or MAX_TOOL_TURNS is hit.
     */
    tools?: Tool[];
    /** Context (userId) passed to every tool `run`. Required if `tools` is set. */
    toolContext?: ToolContext;
    /**
     * Override the job's declared `max_tokens` for this call. Used only by the
     * dynamic router (agent/routing.ts): when the answer path re-routes to a
     * different tier, it preserves the ORIGINAL task's token budget so a
     * re-route never truncates below what the skill asked for. Never lets a
     * value through that would 400 (it only ever raises or matches the budget).
     */
    maxTokensOverride?: number;
  } = {},
): Promise<ModelResult> {
  const spec = jobSpec(job);
  if (spec.provider !== "anthropic") {
    throw new Error(`callModel is Anthropic-only; '${job}' is ${spec.provider}`);
  }

  const client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] =
    call.messages ?? [{ role: "user", content: call.prompt ?? "" }];

  const useTools = (opts.tools?.length ?? 0) > 0;
  const toolByName = new Map((opts.tools ?? []).map((t) => [t.name, t]));
  const toolContext: ToolContext = opts.toolContext ?? { userId: "" };

  // Build params without temperature (would 400 on 4.8/4.6).
  const req: Anthropic.MessageCreateParamsNonStreaming = {
    model: spec.model,
    max_tokens: opts.maxTokensOverride ?? spec.params?.max_tokens ?? 4096,
    messages,
    ...(call.system ? { system: call.system } : {}),
  };
  const extras = req as unknown as Record<string, unknown>;
  if (spec.params?.thinking === "adaptive") {
    // adaptive thinking; summarized so streaming UIs can show RO reasoning.
    extras.thinking = { type: "adaptive", display: "summarized" };
  }
  if (spec.params?.effort) {
    extras.output_config = { effort: spec.params.effort };
  }
  if (useTools) {
    req.tools = (opts.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.jsonSchema as Anthropic.Tool.InputSchema,
    }));
  }

  // Accumulate token/cost across every turn of the loop into one metered record.
  let inTok = 0;
  let outTok = 0;
  let lastStop: string | null = null;
  const toolCalls: ToolCallTrace[] = [];
  const startedAt = Date.now();

  for (let turn = 0; ; turn++) {
    const resp = await client.messages.create(req);
    inTok += resp.usage.input_tokens;
    outTok += resp.usage.output_tokens;
    lastStop = resp.stop_reason;

    const stopForTools = useTools && resp.stop_reason === "tool_use";
    if (!stopForTools || turn >= MAX_TOOL_TURNS) {
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        text,
        run: {
          skill: opts.skill,
          model: spec.model,
          input_tokens: inTok,
          output_tokens: outTok,
          cost_usd: costUsd(spec, inTok, outTok),
          stop_reason: lastStop,
          latency_ms: Date.now() - startedAt,
        },
        ...(useTools ? { toolCalls } : {}),
      };
    }

    // Execute each requested tool and build the tool_result turn.
    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const trace = await runOneTool(toolByName.get(use.name), use.input, toolContext);
      toolCalls.push({ name: use.name, input: use.input, ok: trace.ok, error: trace.error });
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: trace.content,
        ...(trace.ok ? {} : { is_error: true }),
      });
    }

    messages.push({ role: "assistant", content: resp.content });
    messages.push({ role: "user", content: results });
    req.messages = messages;
  }
}

/** Validate + run one tool call. Never throws — errors become recoverable. */
async function runOneTool(
  tool: Tool | undefined,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<{ ok: boolean; error?: string; content: string }> {
  if (!tool) {
    return { ok: false, error: "unknown tool", content: "Error: unknown tool." };
  }
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, error: msg, content: `Error: invalid arguments — ${msg}` };
  }
  try {
    const out = await tool.run(parsed.data, ctx);
    return { ok: true, content: JSON.stringify(out) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, content: `Error: ${msg}` };
  }
}

import Anthropic from "@anthropic-ai/sdk";
import registry from "./registry.json" assert { type: "json" };
import { env } from "@/lib/env";

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

export type AnthropicJob = "reason" | "draft" | "quick_tag" | "critic";
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
}

/** The metered record for one model call — caller persists to `agent_runs`. */
export interface AgentRunRecord {
  skill?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  stop_reason: string | null;
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
  opts: { skill?: string } = {},
): Promise<ModelResult> {
  const spec = jobSpec(job);
  if (spec.provider !== "anthropic") {
    throw new Error(`callModel is Anthropic-only; '${job}' is ${spec.provider}`);
  }

  const client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] =
    call.messages ?? [{ role: "user", content: call.prompt ?? "" }];

  // Build params without temperature (would 400 on 4.8/4.6).
  const req: Anthropic.MessageCreateParamsNonStreaming = {
    model: spec.model,
    max_tokens: spec.params?.max_tokens ?? 4096,
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

  const resp = await client.messages.create(req);

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    text,
    run: {
      skill: opts.skill,
      model: spec.model,
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
      cost_usd: costUsd(spec, resp.usage.input_tokens, resp.usage.output_tokens),
      stop_reason: resp.stop_reason,
    },
  };
}

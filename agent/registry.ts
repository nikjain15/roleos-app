import Anthropic from "@anthropic-ai/sdk";
import registry from "./registry.json" assert { type: "json" };
import { env } from "@/lib/env";
import type { Tool, ToolContext } from "@/agent/tools";
import {
  createRetryRunner,
  retryBudgetFor,
  ProviderCallError,
  type RetryDeps,
} from "@/agent/retry";
import {
  budgetBreach,
  stopNotice,
  textWithNotice,
  toolStateKey,
  type LoopStop,
  type RunBudget,
} from "@/agent/stop";

/**
 * The model registry + the single `callModel(job, input)` path that every
 * Anthropic call in RO goes through. It resolves the job → model, calls the
 * raw Anthropic SDK, and returns text + a usage/cost record the caller writes
 * to `agent_runs`. Cost tracking is not optional — it's in the call path.
 *
 * Per the Claude API reference: Opus 4.8 / Sonnet 4.6 do NOT accept
 * temperature/top_p/top_k or budget_tokens (they 400). Depth is steered with
 * `output_config.effort` + adaptive thinking. Haiku takes neither — plain call.
 *
 * Provider resilience (agent/retry.ts) wraps the round-trip inside this path,
 * so every skill, every gate call and every tool-loop turn inherits the same
 * bounded retry ladder. It sits in FRONT of the quality gate, it does not
 * replace it: a blip is absorbed, a real outage still surfaces honestly as a
 * `MeteredProviderError` carrying the tokens already spent.
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
  /**
   * Which bound ended the tool loop. "completed" means the model finished on
   * its own; anything else means the answer is partial. Distinct from
   * `run.stop_reason`, which is the provider's word for the last turn only and
   * cannot say whether OUR limits cut the run short. See agent/stop.ts.
   */
  loopStop: LoopStop;
  /**
   * User-facing explanation when a bound tripped, empty otherwise. Already
   * folded into `text`, and exposed separately so a caller can style it apart
   * from the answer.
   */
  notice: string;
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
 * A model call that failed at the provider, carrying the metered record for the
 * tokens it DID consume before failing.
 *
 * This exists because of a real accounting hole. `callModel` accumulates
 * tokens across tool-loop turns and only builds an `AgentRunRecord` on the
 * SUCCESS return. If turn 4 of a 6-turn loop fails, turns 1-3 were billed by
 * the provider but the throw discarded the counters, so no `agent_runs` row was
 * ever written and `checkCostBudget`'s rolling-24h sum never saw the spend.
 * Retry makes that hole wider (more billed round-trips per failure), so the
 * partial record travels with the error and the caller meters it exactly like a
 * successful run. The daily budget guard therefore counts failed work too, and
 * cannot be walked past by a job that keeps failing late in its loop.
 *
 * Note on failed ATTEMPTS: a provider error response carries no usage, so a
 * 429 or a 5xx contributes 0 tokens and that is honest, not a gap. What is
 * recorded is every turn that actually returned a usage block.
 */
export class MeteredProviderError extends ProviderCallError {
  readonly run: AgentRunRecord;

  constructor(cause: ProviderCallError, run: AgentRunRecord) {
    super(cause.message, {
      kind: cause.kind,
      status: cause.status,
      attempts: cause.attempts,
      retryable: cause.retryable,
      cause: cause.cause,
    });
    this.name = "MeteredProviderError";
    this.run = run;
  }
}

/**
 * A failure further up the stack that is still carrying metered runs (the gate
 * had already paid for a critic call, the runner had already paid for an
 * earlier tier, and so on). Same principle as MeteredProviderError: spend that
 * happened must reach `agent_runs` even when the job as a whole did not finish.
 */
export class MeteredRunsError extends Error {
  readonly runs: AgentRunRecord[];

  constructor(message: string, runs: AgentRunRecord[], cause?: unknown) {
    super(message, { cause });
    this.name = "MeteredRunsError";
    this.runs = runs;
  }
}

/** Every metered run an error is carrying, whatever shape it arrived in. */
export function meteredRunsOf(err: unknown): AgentRunRecord[] {
  if (err instanceof MeteredProviderError) return [err.run];
  if (err instanceof MeteredRunsError) return err.runs;
  return [];
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
    /**
     * Injected clock/timers for the retry ladder. Tests only; production uses
     * real timers. Exposed here so the resilience path is unit-testable without
     * wall-clock waits or fake global timers.
     */
    retryDeps?: Partial<RetryDeps>;
    /**
     * Token and/or USD ceiling for this whole call, across every tool-loop
     * turn. Omitted means MAX_TOOL_TURNS is the only bound, which is what every
     * caller had before, so an existing skill is unchanged. Distinct from
     * `checkCostBudget`, which alerts on a rolling 24h total after the fact and
     * never stops a run. See agent/stop.ts.
     */
    runBudget?: RunBudget;
    /**
     * Halt when the loop repeats a (tool, args, result) state. On by default:
     * a repeated state cannot produce anything new and would otherwise burn the
     * remaining turns. Set false only where an identical call returning an
     * identical result is genuinely productive.
     */
    detectLoops?: boolean;
  } = {},
): Promise<ModelResult> {
  const spec = jobSpec(job);
  if (spec.provider !== "anthropic") {
    throw new Error(`callModel is Anthropic-only; '${job}' is ${spec.provider}`);
  }

  // maxRetries is set EXPLICITLY to 0. The SDK retries twice by default, which
  // would silently multiply against our own ladder (3 x 3 = 9 round-trips for
  // one turn) and would ignore our per-tier budgets and whole-call deadline.
  // One retry layer, ours, deliberately chosen rather than inherited.
  const client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 0 });

  // One runner per callModel invocation: its deadline is shared across every
  // tool-loop turn, so total elapsed is bounded for the JOB, not per turn.
  const retry = createRetryRunner(retryBudgetFor(job), opts.retryDeps, `callModel(${job})`);

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

  /** The metered record as it stands right now: valid mid-loop, not just at
   *  the end, so a failure can still be costed. */
  const meteredSoFar = (): AgentRunRecord => ({
    skill: opts.skill,
    model: spec.model,
    input_tokens: inTok,
    output_tokens: outTok,
    cost_usd: costUsd(spec, inTok, outTok),
    stop_reason: lastStop,
    latency_ms: Date.now() - startedAt,
  });

  const seenToolStates = new Set<string>();
  const detectLoops = opts.detectLoops ?? true;

  /** Assemble the return. One place, so every exit reports the same shape and
   *  a cut-short run can never hand back a bare empty string again. */
  const finish = (stop: LoopStop, detail: string, rawText: string, turnsTaken: number): ModelResult => {
    const notice = stopNotice(stop, detail, turnsTaken);
    return {
      text: textWithNotice(rawText, notice),
      run: meteredSoFar(),
      ...(useTools ? { toolCalls } : {}),
      loopStop: stop,
      notice,
    };
  };

  const textOf = (resp: Anthropic.Message): string =>
    resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

  for (let turn = 0; ; turn++) {
    let resp: Anthropic.Message;
    try {
      resp = await retry.run((signal) => client.messages.create(req, { signal }));
    } catch (err) {
      // Attach the spend already incurred by earlier turns so the caller can
      // still write it to agent_runs. See MeteredProviderError.
      if (err instanceof ProviderCallError) throw new MeteredProviderError(err, meteredSoFar());
      throw err;
    }
    inTok += resp.usage.input_tokens;
    outTok += resp.usage.output_tokens;
    lastStop = resp.stop_reason;

    const stopForTools = useTools && resp.stop_reason === "tool_use";
    if (!stopForTools) {
      // The model finished on its own. No bound was involved.
      return finish("completed", "", textOf(resp), turn);
    }
    if (turn >= MAX_TOOL_TURNS) {
      return finish("max_tool_turns", `${MAX_TOOL_TURNS} tool turns`, textOf(resp), turn);
    }

    // The turn is charged, so check the ceiling before buying another one.
    const breach = budgetBreach({ tokens: inTok + outTok, costUsd: costUsd(spec, inTok, outTok) }, opts.runBudget);
    if (breach) return finish("budget_exhausted", breach, textOf(resp), turn);

    // Execute each requested tool and build the tool_result turn.
    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const results: Anthropic.ToolResultBlockParam[] = [];
    let repeated: string | null = null;
    for (const use of toolUses) {
      const trace = await runOneTool(toolByName.get(use.name), use.input, toolContext);
      toolCalls.push({ name: use.name, input: use.input, ok: trace.ok, error: trace.error });
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: trace.content,
        ...(trace.ok ? {} : { is_error: true }),
      });

      // Successful calls only. A repeated tool ERROR is not a loop worth
      // halting: the error text is precisely the new information the model
      // needs to fix its arguments, and halting on the second identical
      // validation failure would kill runs that were about to recover.
      if (detectLoops && trace.ok) {
        const key = toolStateKey(use.name, use.input, trace.content);
        if (seenToolStates.has(key)) {
          repeated = `\`${use.name}\` returned an identical result for identical arguments a second time`;
        } else {
          seenToolStates.add(key);
        }
      }
    }
    // Checked after every tool in the turn has run, so the traces and the
    // tool_result blocks stay complete rather than half-built.
    if (repeated) return finish("loop_detected", repeated, textOf(resp), turn + 1);

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

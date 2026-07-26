import { createClient } from "@/lib/conduit/client";
import type {
  ChatMessage,
  ConduitClient,
  EmbeddedCore,
  RetrieveParams,
  RetrieveResult,
} from "@/lib/conduit/client";
import {
  callModel,
  jobSpec,
  type AnthropicJob,
  type ModelCall,
  type ModelResult,
} from "@/agent/registry";
import { recallRolesMulti } from "@/lib/match";

/**
 * The Conduit seam (architecture.md §4.0 + docs/conduit.md).
 *
 * RoleOS keeps its own metered model path (`callModel`) and its own retrieval
 * (`recallRolesMulti`). This module wraps both as a Conduit EMBEDDED core, so
 * the app's primary answer path flows through the same unified `@conduit/client`
 * surface an app would use in gateway mode, with no network hop and no change to
 * cost accounting. The transport is swapped; the behaviour is identical.
 *
 * Embedded mode is designed for exactly this: the caller binds the runtime
 * context (the skill's prompt, tools and tool-context) before injection, which
 * is why the real `ModelCall`/`opts` are threaded in through `bind` rather than
 * reconstructed from the wire params.
 */
const TENANT = "roleos";

interface Bind {
  call: ModelCall;
  opts?: Parameters<typeof callModel>[2];
  /** Captures the full RoleOS ModelResult (metered run + tool trace) resolve produced. */
  onResult?: (result: ModelResult) => void;
}

/**
 * RoleOS role retrieval, exposed through Conduit's unified `retrieve`. Read-only
 * over the global/public role corpus: the same recall step the matcher uses.
 */
export async function roleRetrieve(params: RetrieveParams): Promise<RetrieveResult> {
  const topK = params.topK ?? 8;
  const { candidates } = await recallRolesMulti([params.query], topK);
  const chunks = candidates.map((r) => ({
    id: r.id,
    // pgvector returns a distance; expose a bounded similarity score.
    score: Number((1 - r.distance).toFixed(4)),
    text: `${r.company}: ${r.role_title}${r.archetype ? ` (${r.archetype})` : ""}`,
  }));
  return { chunks, grounded: chunks.length > 0 };
}

/** Build an embedded ConduitClient backed by RoleOS's own model + retrieval. */
export function createRoleOsClient(bind: Bind = { call: {} }): ConduitClient {
  const core: EmbeddedCore = {
    resolve: async (task) => {
      // useCase names a RoleOS registry job. The injected call/opts carry the
      // skill's real prompt, tools and tool-context (bound before injection);
      // if none was bound, fall back to reconstructing a call from the wire task.
      const modelCall: ModelCall =
        bind.call.prompt !== undefined || bind.call.messages !== undefined
          ? bind.call
          : {
              system: task.system,
              prompt: task.messages.map((m) => m.content).join("\n\n"),
            };
      const result = await callModel(task.useCase as AnthropicJob, modelCall, bind.opts);
      bind.onResult?.(result);
      return {
        text: result.text,
        model: { provider: "anthropic", model: result.run.model },
        providerModel: result.run.model,
        costUsd: result.run.cost_usd,
        latencyMs: result.run.latency_ms ?? 0,
      };
    },
    retrieve: roleRetrieve,
    runAgent: async () => {
      throw new Error("conduit.runAgent is not enabled in RoleOS embedded mode");
    },
    evaluate: async () => {
      throw new Error("conduit.evaluate is not enabled in RoleOS embedded mode");
    },
    usage: async () => ({ totalCostUsd: 0, byUseCase: {} }),
  };
  return createClient({ mode: "embedded", core, tenantId: TENANT });
}

/**
 * THE seam runSkill uses: run a RoleOS model job through `@conduit/client`
 * (embedded) and return the full RoleOS `ModelResult` so cost metering and the
 * quality gate are unchanged. The client's `infer` is what actually drives the
 * call, so the answer genuinely flows through Conduit's unified interface.
 */
export async function inferViaConduit(
  job: AnthropicJob,
  call: ModelCall,
  opts?: Parameters<typeof callModel>[2],
): Promise<ModelResult> {
  let captured: ModelResult | undefined;
  const client = createRoleOsClient({ call, opts, onResult: (r) => (captured = r) });

  const messages: ChatMessage[] =
    call.prompt !== undefined
      ? [{ role: "user", content: call.prompt }]
      : (call.messages ?? []).map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));

  const res = await client.infer({
    useCase: job,
    system: call.system,
    messages,
    maxTokens: jobSpec(job).params?.max_tokens,
  });

  if (!captured) throw new Error("conduit infer: resolve did not run");
  // Thread the client's returned output through, keeping RoleOS's metered run.
  return { ...captured, text: res.output };
}

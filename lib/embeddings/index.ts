import { jobSpec } from "@/agent/registry";
import { env } from "@/lib/env";

/**
 * EmbeddingProvider — the one seam that keeps embeddings a config choice.
 * DECIDED (Flag A, 2026-06-27): Cloudflare Workers AI `bge` EVERYWHERE — dev
 * AND prod. No Ollama. One model, one vector space. Dev calls the Workers AI
 * binding over the network. The interface stays so a future swap is one file.
 *
 * Query and corpus embeddings MUST share this provider, or cosine distance is
 * meaningless. `dimensions` is fixed by the registry (`embed.dimensions`).
 */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

class WorkersAIEmbeddings implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  constructor() {
    const spec = jobSpec("embed");
    this.model = spec.model;
    this.dimensions = spec.dimensions ?? 768;
  }
  async embed(texts: string[]): Promise<number[][]> {
    // Prefer the Workers AI binding (correct in the deployed Worker). In the
    // Node dev runtime the binding may be absent — fall back to the same model
    // over the Workers AI REST API (identical vector space).
    let data: number[][] | undefined;
    try {
      const res = (await env().AI.run(this.model, { text: texts })) as {
        data: number[][];
      };
      data = res?.data;
    } catch {
      data = await this.embedViaRest(texts);
    }
    if (!data || data.length !== texts.length) {
      throw new Error(`Embedding count mismatch for model ${this.model}`);
    }
    return data;
  }

  private async embedViaRest(texts: string[]): Promise<number[][]> {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!account || !token) {
      throw new Error("No AI binding and no CLOUDFLARE_ACCOUNT_ID/API_TOKEN for REST fallback");
    }
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${this.model}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: texts }),
      },
    );
    if (!res.ok) throw new Error(`Workers AI REST ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { result: { data: number[][] } }).result.data;
  }
}

let singleton: EmbeddingProvider | null = null;

export function embeddings(): EmbeddingProvider {
  // Single provider configured today; the registry's `embed.provider` is the
  // switch point if we ever add another.
  if (!singleton) singleton = new WorkersAIEmbeddings();
  return singleton;
}

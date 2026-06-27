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
    // Workers AI bge accepts { text: string | string[] } → { data: number[][] }.
    const res = (await env().AI.run(this.model, { text: texts })) as {
      data: number[][];
    };
    if (!res?.data || res.data.length !== texts.length) {
      throw new Error(`Embedding count mismatch for model ${this.model}`);
    }
    return res.data;
  }
}

let singleton: EmbeddingProvider | null = null;

export function embeddings(): EmbeddingProvider {
  // Single provider configured today; the registry's `embed.provider` is the
  // switch point if we ever add another.
  if (!singleton) singleton = new WorkersAIEmbeddings();
  return singleton;
}

/**
 * A deterministic, self-contained retriever over the REAL role corpus, built to
 * mirror the SHAPE of the production retriever (lib/match.ts:recallRolesMulti):
 * a single-query nearest-neighbour rank, and a MULTI-QUERY union that runs each
 * facet and keeps every role's BEST score across facets. This lets the offline
 * eval report a real precision@k / F1 on the actual corpus AND run the
 * single-vs-multi A/B — with zero external dependencies (no DB, no Workers AI).
 *
 * The similarity here is TF-IDF cosine (lexical), not bge embeddings, so the
 * ABSOLUTE numbers are a lexical baseline. The production semantic retriever is
 * scored by the same runner via a captured dataset (see capture.ts) when
 * Supabase + Workers AI creds are present. What transfers regardless is the
 * RELATIVE result: multi-query union vs single-query on the same real corpus.
 */
import type { RoleDoc } from "./corpus.ts";

const STOP = new Set(
  "a an the of to and or for with in on at by from as is are be this that you your we our their they it its into across over under about within than then so such can will would should must have has had who whom which what when where why how not no yes".split(
    " ",
  ),
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

type Vec = Map<string, number>;

export interface RetrieverIndex {
  docs: RoleDoc[];
  vecs: Vec[];
  idf: Map<string, number>;
}

function tf(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  // log-scaled term frequency
  for (const [k, v] of counts) counts.set(k, 1 + Math.log(v));
  return counts;
}

function weight(tfMap: Map<string, number>, idf: Map<string, number>): Vec {
  const v: Vec = new Map();
  for (const [term, f] of tfMap) v.set(term, f * (idf.get(term) ?? 0));
  return v;
}

function cosine(a: Vec, b: Vec): number {
  let dot = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [k, va] of small) {
    const vb = large.get(k);
    if (vb) dot += va * vb;
  }
  if (dot === 0) return 0;
  let na = 0;
  for (const v of a.values()) na += v * v;
  let nb = 0;
  for (const v of b.values()) nb += v * v;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function buildIndex(docs: RoleDoc[]): RetrieverIndex {
  const df = new Map<string, number>();
  const docTf = docs.map((d) => {
    const t = tf(tokenize(d.text));
    for (const term of t.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    return t;
  });
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [term, d] of df) idf.set(term, Math.log((n + 1) / (d + 1)) + 1);
  const vecs = docTf.map((t) => weight(t, idf));
  return { docs, vecs, idf };
}

export interface ScoredHit {
  id: string;
  score: number;
}

/** Rank the corpus for ONE query. Best-first, top `k`. */
export function rankSingle(index: RetrieverIndex, query: string, k: number): ScoredHit[] {
  const qv = weight(tf(tokenize(query)), index.idf);
  const scored = index.docs.map((d, i) => ({ id: d.id, score: cosine(qv, index.vecs[i]) }));
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * Multi-query union — the domain-bias fix mirrored offline. Run each facet, take
 * its top `perQuery`, then UNION keeping each role's BEST score across facets
 * (the analogue of lib/match.ts:mergeHits keeping the smallest distance). A role
 * that only ONE facet surfaces still enters the pool.
 */
export function rankMulti(
  index: RetrieverIndex,
  facets: string[],
  k: number,
  perQuery = 24,
): ScoredHit[] {
  const best = new Map<string, number>();
  for (const facet of facets) {
    for (const hit of rankSingle(index, facet, perQuery)) {
      const prev = best.get(hit.id);
      if (prev === undefined || hit.score > prev) best.set(hit.id, hit.score);
    }
  }
  return [...best.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Pure ranking-metric functions for the RoleOS retrieval eval.
 * Self-contained: no imports from the app, no network, no model calls.
 * These are the standard IR metrics named in docs/EVALS.md.
 */

export interface RankedCase {
  /** Human label for the query (e.g. "senior AI PM"). */
  id: string;
  /** Ordered list of role ids the retriever returned, best first. */
  ranked: string[];
  /** The set of role ids a human judged genuinely relevant. */
  relevant: string[];
}

/** Fraction of the top-k that are relevant. */
export function precisionAtK(ranked: string[], relevant: Set<string>, k: number): number {
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  const hits = top.filter((r) => relevant.has(r)).length;
  return hits / top.length;
}

/** Fraction of all relevant items found within the top-k. */
export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 1; // nothing to find → trivially satisfied
  const top = new Set(ranked.slice(0, k));
  let found = 0;
  for (const r of relevant) if (top.has(r)) found++;
  return found / relevant.size;
}

/** Reciprocal rank of the first relevant hit (0 if none). */
export function reciprocalRank(ranked: string[], relevant: Set<string>): number {
  for (let i = 0; i < ranked.length; i++) {
    if (relevant.has(ranked[i])) return 1 / (i + 1);
  }
  return 0;
}

/** F1 from a precision and a recall value. */
export function f1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export interface AggregateReport {
  n: number;
  k: number;
  meanPrecisionAtK: number;
  meanRecallAtK: number;
  meanF1: number;
  mrr: number;
  perCase: Array<{ id: string; precision: number; recall: number; rr: number }>;
}

/** Aggregate all metrics across a set of ranked cases at cutoff k. */
export function evaluate(cases: RankedCase[], k: number): AggregateReport {
  const perCase = cases.map((c) => {
    const rel = new Set(c.relevant);
    const precision = precisionAtK(c.ranked, rel, k);
    const recall = recallAtK(c.ranked, rel, k);
    const rr = reciprocalRank(c.ranked, rel);
    return { id: c.id, precision, recall, rr };
  });
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const meanPrecisionAtK = mean(perCase.map((p) => p.precision));
  const meanRecallAtK = mean(perCase.map((p) => p.recall));
  return {
    n: cases.length,
    k,
    meanPrecisionAtK,
    meanRecallAtK,
    meanF1: f1(meanPrecisionAtK, meanRecallAtK),
    mrr: mean(perCase.map((p) => p.rr)),
    perCase,
  };
}

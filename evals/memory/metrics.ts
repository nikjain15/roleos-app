/**
 * Pure recall-quality metrics for RO's notebook re-ranker (docs/specs/ro-memory.md,
 * M3 §"Measured, not claimed"). Given labeled candidate notes for a query, does
 * rankRecall surface the RELEVANT ones in the top-k? Honest target = recall
 * precision — never a claim RO can't back. Ships behind this eval; grow the fixtures
 * as real (query, notes, human-relevance) triples are labeled.
 */

import { rankRecall, type RoNote } from "@/lib/ro/memory";

export interface LabeledNote extends RoNote {
  /** Did a human judge this note relevant to the case's query? */
  relevant: boolean;
}

export interface RecallCase {
  id: string;
  scope?: string;
  k: number;
  candidates: LabeledNote[];
}

export interface RecallReport {
  cases: number;
  /** Mean fraction of the top-k that are relevant. */
  precisionAtK: number;
  /** Mean fraction of all relevant notes surfaced within the top-k. */
  recallAtK: number;
  perCase: Array<{ id: string; precision: number; recall: number }>;
}

export function evaluateRecall(cases: RecallCase[]): RecallReport {
  const perCase = cases.map((c) => {
    const ranked = rankRecall(c.candidates as RoNote[], { scope: c.scope, limit: c.k });
    const relevantIds = new Set(c.candidates.filter((n) => n.relevant).map((n) => n.id));
    const hitsInTopK = ranked.filter((n) => relevantIds.has(n.id)).length;
    const precision = ranked.length ? hitsInTopK / ranked.length : 0;
    const recall = relevantIds.size ? hitsInTopK / relevantIds.size : 1;
    return { id: c.id, precision, recall };
  });
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    cases: cases.length,
    precisionAtK: mean(perCase.map((p) => p.precision)),
    recallAtK: mean(perCase.map((p) => p.recall)),
    perCase,
  };
}

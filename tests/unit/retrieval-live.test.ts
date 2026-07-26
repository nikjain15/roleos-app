import { describe, it, expect } from "vitest";
import { runLiveEval } from "../../evals/retrieval/live/run.ts";
import { loadCorpus } from "../../evals/retrieval/live/corpus.ts";

/**
 * The LIVE retrieval eval runs over the REAL role corpus (seed/roles/*.json) in
 * CI — a genuine precision@k / MRR on the actual corpus, not synthetic fixtures.
 * This is the CI gate: the same thresholds evals/retrieval/live/run.ts enforces,
 * plus the multi-query-beats-single-query A/B the audit asked to prove.
 */
describe("live retrieval eval · real corpus", () => {
  const { single, multi, singleWide, multiWide, corpusSize } = runLiveEval();

  it("scores a real, non-trivial corpus", () => {
    expect(corpusSize).toBeGreaterThan(500);
    expect(loadCorpus().length).toBe(corpusSize);
  });

  it("meets the matching-quality floor: precision@10 ≥ 0.5 and MRR ≥ 0.7", () => {
    expect(multi.meanPrecisionAtK).toBeGreaterThanOrEqual(0.5);
    expect(multi.mrr).toBeGreaterThanOrEqual(0.7);
  });

  it("multi-query union beats single-query on precision@10 and MRR", () => {
    expect(multi.meanPrecisionAtK).toBeGreaterThanOrEqual(single.meanPrecisionAtK);
    expect(multi.mrr).toBeGreaterThanOrEqual(single.mrr);
  });

  it("multi-query union recovers at least as much of the pool at k=36 (recall)", () => {
    expect(multiWide.meanRecallAtK).toBeGreaterThanOrEqual(singleWide.meanRecallAtK);
  });
});

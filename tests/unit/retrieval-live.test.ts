import { describe, it, expect } from "vitest";
import {
  runLiveEval,
  runSemanticEval,
  hasSemanticDataset,
} from "../../evals/retrieval/live/run.ts";
import { loadCorpus } from "../../evals/retrieval/live/corpus.ts";

/**
 * RETRIEVAL EVAL: what is gated, and what is NOT (finding B1).
 *
 * This file used to be called "the CI gate" for matching quality, and docs/EVALS.md
 * presented its precision@10 and MRR floors as the flagship matcher's SLA. That
 * claim was wrong in a way that mattered: `evals/retrieval/live/retriever.ts` is a
 * TF-IDF stand-in, production retrieval is bge embeddings over pgvector, and CI now
 * gates production deploys. A real semantic regression, a bad re-embed, a broken
 * pgvector index, would sail through green.
 *
 * Nothing here is deleted, because the lexical eval is genuinely useful: it scores
 * the query construction, the multi-query union, and the real 689-role corpus, all
 * of which ARE shared with production. What changed is the naming. Every assertion
 * below says which retriever it is talking about, so no reader can mistake a green
 * run for evidence about the shipped matcher.
 *
 * The gap closes the day someone runs `npm run eval:retrieval:capture` with live
 * credentials and commits `dataset.semantic.json`. The last block below is written
 * so that it starts gating the shipped retriever automatically on that day, and
 * states the gap plainly until then.
 */
describe("retrieval eval · TF-IDF lexical baseline over the real corpus (NOT the shipped retriever)", () => {
  const { single, multi, singleWide, multiWide, corpusSize } = runLiveEval();

  it("scores a real, non-trivial corpus", () => {
    expect(corpusSize).toBeGreaterThan(500);
    expect(loadCorpus().length).toBe(corpusSize);
  });

  it("lexical baseline meets its floor: precision@10 >= 0.5 and MRR >= 0.7", () => {
    expect(multi.meanPrecisionAtK).toBeGreaterThanOrEqual(0.5);
    expect(multi.mrr).toBeGreaterThanOrEqual(0.7);
  });

  it("multi-query union beats single-query on precision@10 and MRR (lexical)", () => {
    expect(multi.meanPrecisionAtK).toBeGreaterThanOrEqual(single.meanPrecisionAtK);
    expect(multi.mrr).toBeGreaterThanOrEqual(single.mrr);
  });

  it("multi-query union recovers at least as much of the pool at k=36 (lexical recall)", () => {
    expect(multiWide.meanRecallAtK).toBeGreaterThanOrEqual(singleWide.meanRecallAtK);
  });
});

describe("retrieval eval · the SHIPPED retriever (bge over pgvector) is NOT measured in CI", () => {
  const semantic = runSemanticEval();

  it("records the gap explicitly while no production capture exists", () => {
    if (hasSemanticDataset()) {
      // A capture landed. The gap is closed; the block below now gates for real.
      expect(semantic).not.toBeNull();
      return;
    }
    // This is the honest state, asserted rather than described in a comment, so
    // that it cannot quietly stop being true in either direction.
    //
    //   The shipped retriever has NEVER been scored. `dataset.semantic.json` does
    //   not exist. `capture.ts` needs live Supabase + Workers AI credentials,
    //   which CI does not have and must not have. Nothing in this repository can
    //   detect a bge/pgvector regression before it reaches production.
    //
    // To close it: run `npm run eval:retrieval:capture` with real credentials,
    // commit the dataset, and this test flips to gating the numbers below.
    expect(semantic).toBeNull();
  });

  it("gates the shipped retriever's precision@10 and MRR the moment a capture is committed", () => {
    if (!semantic) {
      // Deliberately not skipped and not silently passed: the assertion above is
      // the one carrying the meaning, and this one records why there is nothing
      // to check yet.
      expect(hasSemanticDataset()).toBe(false);
      return;
    }
    expect(semantic.ds.retriever).toContain("bge");
    expect(semantic.multi.meanPrecisionAtK).toBeGreaterThanOrEqual(0.5);
    expect(semantic.multi.mrr).toBeGreaterThanOrEqual(0.7);
  });
});

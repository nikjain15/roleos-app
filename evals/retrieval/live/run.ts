/**
 * LIVE-corpus retrieval eval (offline, self-contained, runs in CI).
 *
 *   npx tsx evals/retrieval/live/run.ts
 *
 * Unlike the synthetic sibling (../run.ts), this scores a REAL retriever over
 * the REAL role corpus (seed/roles/*.json → the same postings that seed the
 * production `roles` table), using the frozen labels in queries.json. It reports
 * precision@k / recall@k / F1 / MRR for BOTH the single-query rank and the
 * multi-query union — the A/B the audit asked for ("prove multi-query beats
 * single-query with a number") — and exits non-zero if multi-query F1 drops
 * below the floor or fails to beat single-query.
 *
 * WHAT THIS DOES AND DOES NOT GATE (finding B1). The similarity used here is a
 * TF-IDF LEXICAL BASELINE. Production retrieval is bge embeddings over pgvector.
 * They are different algorithms over the same corpus, so:
 *
 *   • CATCHES: a regression in the query construction, the multi-query union and
 *     its best-score-per-role merge, the corpus itself (a role dropped, an id
 *     collision, a mangled title), and the labelled relevance sets. These are
 *     shared with production and they are the things that break most often.
 *   • DOES NOT CATCH: anything specific to the shipped retriever. A changed
 *     embedding model, a botched re-embed, a broken pgvector index, a distance
 *     metric flipped, a similarity threshold set wrong. None of that moves a
 *     single number in this file.
 *
 * That matters more than it used to, because CI now gates production deploys. A
 * green run on this page is NOT evidence that the shipped matcher still works.
 *
 * `runSemanticEval` below closes it, and it needs `dataset.semantic.json`, which
 * capture.ts produces from a real credentialled run and which has never been
 * generated. Until it is, this file reports the gap loudly rather than letting
 * the lexical floor be read as a matching-quality SLA.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluate, type RankedCase } from "../metrics.ts";
import { loadCorpus } from "./corpus.ts";
import { buildIndex, rankSingle, rankMulti } from "./retriever.ts";

// Relevant sets here are whole archetype cohorts (70–163 roles), so recall@10
// and thus F1 are structurally capped (≤ 10/|relevant|). The meaningful SLA on
// this corpus is head quality: precision@k + MRR. Recall is compared at the
// production POOL width (poolK) where the multi-query union's benefit shows.
const PRECISION_FLOOR = Number(process.env.RETRIEVAL_PRECISION_FLOOR ?? 0.5);
const MRR_FLOOR = Number(process.env.RETRIEVAL_MRR_FLOOR ?? 0.7);
const POOL_K = Number(process.env.RETRIEVAL_POOL_K ?? 36);

interface LiveCase {
  id: string;
  query: string;
  facets: string[];
  relevant: string[];
}
interface Dataset {
  k: number;
  corpusSize: number;
  cases: LiveCase[];
}

function toRankedCases(cases: LiveCase[], ranked: Map<string, string[]>): RankedCase[] {
  return cases.map((c) => ({ id: c.id, ranked: ranked.get(c.id) ?? [], relevant: c.relevant }));
}

export function runLiveEval() {
  const path = fileURLToPath(new URL("./queries.json", import.meta.url));
  const ds = JSON.parse(readFileSync(path, "utf8")) as Dataset;
  const corpus = loadCorpus();
  const index = buildIndex(corpus);

  const singleRanked = new Map<string, string[]>();
  const multiRanked = new Map<string, string[]>();
  for (const c of ds.cases) {
    singleRanked.set(
      c.id,
      rankSingle(index, c.query, ds.k).map((h) => h.id),
    );
    multiRanked.set(
      c.id,
      rankMulti(index, c.facets, ds.k).map((h) => h.id),
    );
  }

  const single = evaluate(toRankedCases(ds.cases, singleRanked), ds.k);
  const multi = evaluate(toRankedCases(ds.cases, multiRanked), ds.k);

  // Recall at the production pool width — where the union's benefit is designed
  // to show (a wide, diverse pool handed to the reranker).
  const singlePool = new Map<string, string[]>();
  const multiPool = new Map<string, string[]>();
  for (const c of ds.cases) {
    singlePool.set(c.id, rankSingle(index, c.query, POOL_K).map((h) => h.id));
    multiPool.set(c.id, rankMulti(index, c.facets, POOL_K, POOL_K).map((h) => h.id));
  }
  const singleWide = evaluate(toRankedCases(ds.cases, singlePool), POOL_K);
  const multiWide = evaluate(toRankedCases(ds.cases, multiPool), POOL_K);
  return { ds, corpusSize: corpus.length, single, multi, singleWide, multiWide };
}

/**
 * THE SHIPPED RETRIEVER (bge over pgvector), scored from a captured dataset.
 *
 * `runLiveEval` above scores a TF-IDF stand-in. Production does not use TF-IDF.
 * The only way to score what actually ships, offline and without credentials in
 * CI, is to capture the production rankings once with real creds
 * (`npm run eval:retrieval:capture`) and commit the result.
 *
 * That capture has never been run: `dataset.semantic.json` is absent. This
 * function is what turns the capture into a scored, gated number the moment it
 * lands, so nobody has to remember to wire it up. Until then it returns null,
 * and `tests/unit/retrieval-live.test.ts` states that gap in its own name rather
 * than letting the lexical floor stand in for it.
 */
export interface SemanticCase {
  id: string;
  singleRanked: string[];
  multiRanked: string[];
  relevant: string[];
}
export interface SemanticDataset {
  k: number;
  capturedAt: string;
  retriever: string;
  cases: SemanticCase[];
}

export function semanticDatasetPath(): string {
  return fileURLToPath(new URL("./dataset.semantic.json", import.meta.url));
}

export function hasSemanticDataset(): boolean {
  return existsSync(semanticDatasetPath());
}

/** Score the captured production retriever, or null when no capture exists yet. */
export function runSemanticEval() {
  if (!hasSemanticDataset()) return null;
  const ds = JSON.parse(readFileSync(semanticDatasetPath(), "utf8")) as SemanticDataset;
  const single = evaluate(
    ds.cases.map((c) => ({ id: c.id, ranked: c.singleRanked, relevant: c.relevant })),
    ds.k,
  );
  const multi = evaluate(
    ds.cases.map((c) => ({ id: c.id, ranked: c.multiRanked, relevant: c.relevant })),
    ds.k,
  );
  return { ds, single, multi };
}

function main(): void {
  const { ds, corpusSize, single, multi, singleWide, multiWide } = runLiveEval();

  console.log(
    `\nRoleOS LIVE retrieval eval — ${multi.n} labeled queries over ${corpusSize} real roles @ k=${ds.k}\n`,
  );
  console.log("case".padEnd(28), "single".padStart(8), "multi".padStart(8), "Δprec".padStart(8));
  for (let i = 0; i < multi.perCase.length; i++) {
    const s = single.perCase[i];
    const m = multi.perCase[i];
    console.log(
      m.id.padEnd(28),
      s.precision.toFixed(2).padStart(8),
      m.precision.toFixed(2).padStart(8),
      (m.precision - s.precision).toFixed(2).padStart(8),
    );
  }

  const row = (label: string, r: typeof multi) =>
    `${label.padEnd(16)} P@${ds.k}=${r.meanPrecisionAtK.toFixed(3)}  R@${ds.k}=${r.meanRecallAtK.toFixed(
      3,
    )}  F1=${r.meanF1.toFixed(3)}  MRR=${r.mrr.toFixed(3)}`;
  console.log(`\n--- head quality @k=${ds.k} (mean over queries) ---`);
  console.log(row("single-query", single));
  console.log(row("multi-query", multi));
  const precLift = multi.meanPrecisionAtK - single.meanPrecisionAtK;
  const mrrLift = multi.mrr - single.mrr;
  const recallLift = multiWide.meanRecallAtK - singleWide.meanRecallAtK;
  console.log(`\n--- A/B: multi-query union vs single-query ---`);
  console.log(`precision@${ds.k} lift:   ${precLift >= 0 ? "+" : ""}${precLift.toFixed(3)}`);
  console.log(`MRR lift:          ${mrrLift >= 0 ? "+" : ""}${mrrLift.toFixed(3)}`);
  console.log(
    `recall@${POOL_K} lift:    ${recallLift >= 0 ? "+" : ""}${recallLift.toFixed(3)} (single ${singleWide.meanRecallAtK.toFixed(3)} → multi ${multiWide.meanRecallAtK.toFixed(3)})`,
  );

  const fails: string[] = [];
  if (multi.meanPrecisionAtK < PRECISION_FLOOR)
    fails.push(`precision@${ds.k} ${multi.meanPrecisionAtK.toFixed(3)} < floor ${PRECISION_FLOOR}`);
  if (multi.mrr < MRR_FLOOR) fails.push(`MRR ${multi.mrr.toFixed(3)} < floor ${MRR_FLOOR}`);
  if (multi.meanPrecisionAtK + 1e-9 < single.meanPrecisionAtK)
    fails.push(
      `multi precision ${multi.meanPrecisionAtK.toFixed(3)} < single ${single.meanPrecisionAtK.toFixed(3)}`,
    );
  if (multiWide.meanRecallAtK + 1e-9 < singleWide.meanRecallAtK)
    fails.push(
      `multi recall@${POOL_K} ${multiWide.meanRecallAtK.toFixed(3)} < single ${singleWide.meanRecallAtK.toFixed(3)}`,
    );

  if (fails.length) {
    console.error(`\nFAIL:\n  - ${fails.join("\n  - ")}\n`);
    process.exit(1);
  }
  console.log(
    `\nPASS (LEXICAL BASELINE ONLY): precision@${ds.k} ${multi.meanPrecisionAtK.toFixed(3)} ≥ ${PRECISION_FLOOR}, MRR ${multi.mrr.toFixed(3)} ≥ ${MRR_FLOOR}; multi-query ≥ single on precision & recall@${POOL_K}`,
  );

  const semantic = runSemanticEval();
  if (!semantic) {
    console.log(
      `\nNOT MEASURED: the SHIPPED retriever (bge over pgvector) is not scored here.\n` +
        `Everything above is the TF-IDF stand-in in retriever.ts. A real semantic\n` +
        `regression would not move any number on this page. To close it, run\n` +
        `  npm run eval:retrieval:capture\n` +
        `with live Supabase + Workers AI creds and commit dataset.semantic.json.\n`,
    );
    return;
  }
  console.log(
    `\n--- SHIPPED retriever (${semantic.ds.retriever}, captured ${semantic.ds.capturedAt}) ---\n` +
      `multi-query  P@${semantic.ds.k}=${semantic.multi.meanPrecisionAtK.toFixed(3)}  MRR=${semantic.multi.mrr.toFixed(3)}\n` +
      `single-query P@${semantic.ds.k}=${semantic.single.meanPrecisionAtK.toFixed(3)}  MRR=${semantic.single.mrr.toFixed(3)}\n`,
  );
  const semFails: string[] = [];
  if (semantic.multi.meanPrecisionAtK < PRECISION_FLOOR)
    semFails.push(
      `semantic precision@${semantic.ds.k} ${semantic.multi.meanPrecisionAtK.toFixed(3)} < floor ${PRECISION_FLOOR}`,
    );
  if (semantic.multi.mrr < MRR_FLOOR)
    semFails.push(`semantic MRR ${semantic.multi.mrr.toFixed(3)} < floor ${MRR_FLOOR}`);
  if (semFails.length) {
    console.error(`\nFAIL (shipped retriever):\n  - ${semFails.join("\n  - ")}\n`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();

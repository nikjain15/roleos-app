/**
 * RoleOS retrieval eval runner (offline, self-contained).
 *
 *   npx tsx evals/retrieval/run.ts
 *
 * Loads evals/retrieval/dataset.json, computes precision@k / recall@k / F1 / MRR
 * over the labeled cases, prints a per-case table + aggregate, and exits non-zero
 * if the mean F1 falls below THRESHOLD (so it can gate CI once real fixtures land).
 *
 * This runner touches NO production code, database, network, or model — it scores
 * a ranking against labels. To evaluate the live retriever, replace each case's
 * `ranked` array with the role ids `recallRolesMulti` returns for that query.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluate, type RankedCase } from "./metrics.ts";

const THRESHOLD = 0.5; // mean-F1 floor; tune as the labeled set grows

interface Dataset {
  k: number;
  cases: Array<RankedCase & { query: string }>;
}

function main(): void {
  const path = fileURLToPath(new URL("./dataset.json", import.meta.url));
  const ds = JSON.parse(readFileSync(path, "utf8")) as Dataset;
  const report = evaluate(ds.cases, ds.k);

  console.log(`\nRoleOS retrieval eval — ${report.n} cases @ k=${report.k}\n`);
  console.log("case".padEnd(26), "prec".padStart(6), "recall".padStart(8), "rr".padStart(6));
  for (const c of report.perCase) {
    console.log(
      c.id.padEnd(26),
      c.precision.toFixed(2).padStart(6),
      c.recall.toFixed(2).padStart(8),
      c.rr.toFixed(2).padStart(6),
    );
  }
  console.log("\n--- aggregate ---");
  console.log(`mean precision@${report.k}: ${report.meanPrecisionAtK.toFixed(3)}`);
  console.log(`mean recall@${report.k}:    ${report.meanRecallAtK.toFixed(3)}`);
  console.log(`mean F1:               ${report.meanF1.toFixed(3)}`);
  console.log(`MRR:                   ${report.mrr.toFixed(3)}`);

  if (report.meanF1 < THRESHOLD) {
    console.error(`\nFAIL: mean F1 ${report.meanF1.toFixed(3)} < threshold ${THRESHOLD}`);
    process.exit(1);
  }
  console.log(`\nPASS: mean F1 ${report.meanF1.toFixed(3)} >= threshold ${THRESHOLD}\n`);
}

main();

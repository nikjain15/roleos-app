/**
 * RoleOS coverage-judge eval runner (offline, self-contained).
 *
 *   npx tsx evals/coverage/run.ts
 *
 * Loads evals/coverage/dataset.json (human GOLD + PREDICTED verdicts), computes
 * the judge's agreement — exact accuracy, mean ordinal error, over-credit rate,
 * and rolled-up score error — prints a per-case table + aggregate, and exits
 * non-zero if accuracy falls below THRESHOLD (so it can gate CI as the labeled
 * set grows). Touches NO database, network, or model — it scores predictions
 * against labels. To evaluate the LIVE judge, replace each requirement's
 * `predicted` with `judgeCoverage` output (see dataset.json's _comment).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateCoverage, type CoverageEvalCase } from "./metrics.ts";

const THRESHOLD = 0.7; // exact-agreement floor; tune as the labeled set grows.

interface Dataset {
  cases: CoverageEvalCase[];
}

function main(): void {
  const path = fileURLToPath(new URL("./dataset.json", import.meta.url));
  const ds = JSON.parse(readFileSync(path, "utf8")) as Dataset;
  const report = evaluateCoverage(ds.cases);

  console.log(`\nRoleOS coverage-judge eval — ${report.cases} cases, ${report.n} requirements\n`);
  console.log("case".padEnd(30), "acc".padStart(6), "gold".padStart(6), "pred".padStart(6));
  for (const c of report.perCase) {
    console.log(
      c.id.padEnd(30),
      c.accuracy.toFixed(2).padStart(6),
      String(c.goldScore).padStart(6),
      String(c.predictedScore).padStart(6),
    );
  }
  console.log("\n--- aggregate ---");
  console.log(`verdict accuracy:     ${report.accuracy.toFixed(3)}`);
  console.log(`mean ordinal error:   ${report.meanOrdinalError.toFixed(3)}`);
  console.log(`over-credit rate:     ${report.overCreditRate.toFixed(3)}  (the dangerous direction)`);
  console.log(`mean score error:     ${report.meanScoreError.toFixed(2)} pts`);

  if (report.accuracy < THRESHOLD) {
    console.error(`\nFAIL: verdict accuracy ${report.accuracy.toFixed(3)} < threshold ${THRESHOLD}`);
    process.exit(1);
  }
  console.log(`\nPASS: verdict accuracy ${report.accuracy.toFixed(3)} >= threshold ${THRESHOLD}\n`);
}

main();

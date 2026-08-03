#!/usr/bin/env node
/**
 * RoleOS cost model. docs/COST.md.
 *
 * WHY A SCRIPT AND NOT A TABLE IN A DOC. A number typed into markdown is true on the
 * day it is typed. This reads `agent/registry.json` directly, so the model ids, the
 * per-job output ceilings and the per-million-token prices all come from the config
 * that actually routes traffic. Re-tier a job or reprice a model and the model moves
 * with it. `npm run cost:model` regenerates the tables in docs/COST.md.
 *
 * WHAT IS MEASURED, ESTIMATED, AND ASSUMED, because the difference decides how much
 * the output is worth:
 *
 *   MEASURED from config   every model id, every `max_tokens` ceiling, every price
 *                          in `cost_per_mtok`. Nothing here is retyped.
 *   ESTIMATED              token counts for the prompt, via characters / 4. An
 *                          approximation, not a measurement. Anthropic's tokenizer
 *                          is not available offline and count_tokens needs a key.
 *   ASSUMED                prompt sizes, how much of each output ceiling is really
 *                          used, and how many calls a candidate's journey makes.
 *
 * The ceiling column is the one number here that is neither estimated nor assumed:
 * `max_tokens` is a hard cap the provider enforces, so "worst case per call" is a
 * real bound. Everything else is a projection. Treat the journey totals as an order
 * of magnitude.
 *
 * To replace the estimates with measurements: every call already writes real token
 * counts and a cost to `agent_runs` (see agent/registry.ts, `callModel`). One day of
 * live traffic makes `lib/admin-stats.ts` authoritative and this script redundant
 * for anything except forecasting.
 *
 * Usage:
 *   node scripts/cost-model.mjs           print the model
 *   node scripts/cost-model.mjs --json    machine-readable
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Characters per token. Rough English-prose constant, and the largest error source. */
export const CHARS_PER_TOKEN = 4;

/**
 * Per-job assumptions. Only two numbers per job, and both are ASSUMPTIONS:
 *
 *   promptChars   how much text goes in (system prompt + user context + retrieved
 *                 material). Bigger for jobs that carry a resume or a role corpus.
 *   outputUse     what share of the job's configured `max_tokens` a typical call
 *                 actually produces. A ceiling is not a forecast: `code` is allowed
 *                 16k tokens and rarely emits that much.
 *
 * Chosen to be defensible rather than flattering. If they are wrong, they are the
 * first thing to fix, and `agent_runs` already holds the data to fix them with.
 */
export const JOB_ASSUMPTIONS = {
  reason: { promptChars: 12_000, outputUse: 0.5 },
  draft: { promptChars: 16_000, outputUse: 0.6 },
  code: { promptChars: 8_000, outputUse: 0.7 },
  quick_tag: { promptChars: 1_500, outputUse: 0.2 },
  critic: { promptChars: 10_000, outputUse: 0.6 },
};

/**
 * One candidate working through RoleOS end to end. ASSUMED call counts, informed by
 * where each job is actually invoked in the codebase (11 quick_tag call sites, 4
 * draft, 3 reason), not invented from nothing.
 */
export const JOURNEY = {
  label: "one candidate, full journey",
  calls: { reason: 3, draft: 4, quick_tag: 12, critic: 2, code: 1 },
};

/** Monthly volume. ASSUMED. */
export const CANDIDATES_PER_MONTH = 200;

const tokens = (chars) => Math.ceil(chars / CHARS_PER_TOKEN);

export function readRegistry() {
  const raw = JSON.parse(readFileSync(resolve(ROOT, "agent/registry.json"), "utf8"));
  if (!raw?.jobs) {
    console.error("cost-model: agent/registry.json has no `jobs`. The source moved; fix this script.");
    process.exit(2);
  }
  return raw.jobs;
}

export function costOf(job, spec, assumption) {
  const price = spec.cost_per_mtok;
  if (!price) {
    console.error(`cost-model: job "${job}" has no cost_per_mtok in registry.json.`);
    process.exit(2);
  }
  const maxOut = spec.params?.max_tokens ?? 0;
  const inTok = tokens(assumption.promptChars);
  const typicalOut = Math.round(maxOut * assumption.outputUse);

  const priceFor = (out) => (inTok / 1e6) * price.input + (out / 1e6) * price.output;

  return {
    job,
    model: spec.model,
    maxOut,
    inTok,
    typicalOut,
    /** Hard bound: the provider will not emit more than max_tokens. */
    ceilingUsd: priceFor(maxOut),
    typicalUsd: priceFor(typicalOut),
  };
}

export function computeModel() {
  const jobs = readRegistry();
  const rows = [];
  for (const [job, assumption] of Object.entries(JOB_ASSUMPTIONS)) {
    const spec = jobs[job];
    if (!spec) {
      console.error(`cost-model: job "${job}" is in JOB_ASSUMPTIONS but not in registry.json.`);
      process.exit(2);
    }
    rows.push(costOf(job, spec, assumption));
  }

  // A job in the registry with no assumption is a silent gap in this model, so say so.
  const unmodelled = Object.keys(jobs).filter(
    (j) => !(j in JOB_ASSUMPTIONS) && jobs[j].provider === "anthropic",
  );

  const byJob = Object.fromEntries(rows.map((r) => [r.job, r]));
  let journeyTypical = 0;
  let journeyCeiling = 0;
  for (const [job, n] of Object.entries(JOURNEY.calls)) {
    journeyTypical += byJob[job].typicalUsd * n;
    journeyCeiling += byJob[job].ceilingUsd * n;
  }

  // What the tiering is worth: the same journey with every call on the dearest tier.
  const dearest = rows.reduce((a, b) => (b.ceilingUsd / b.maxOut > a.ceilingUsd / a.maxOut ? b : a));
  const allTopTier = Object.entries(JOURNEY.calls).reduce((sum, [job, n]) => {
    const r = byJob[job];
    const p = jobs[dearest.job].cost_per_mtok;
    return sum + n * ((r.inTok / 1e6) * p.input + (r.typicalOut / 1e6) * p.output);
  }, 0);

  return {
    rows,
    unmodelled,
    journeyTypical,
    journeyCeiling,
    allTopTier,
    topTierModel: jobs[dearest.job].model,
    monthlyTypical: journeyTypical * CANDIDATES_PER_MONTH,
    monthlyAllTopTier: allTopTier * CANDIDATES_PER_MONTH,
  };
}

const usd = (n) => (n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(2)}`);

function main() {
  const r = computeModel();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    return;
  }

  console.log("\nRoleOS cost model");
  console.log("=================");
  console.log("All model ids, output ceilings and prices read from agent/registry.json.\n");
  console.log("| Job | Model | Max out | ~In | ~Typical out | Typical/call | Ceiling/call |");
  console.log("|---|---|---|---|---|---|---|");
  for (const x of r.rows) {
    console.log(
      `| \`${x.job}\` | ${x.model} | ${x.maxOut} | ${x.inTok} | ${x.typicalOut} | ${usd(x.typicalUsd)} | ${usd(x.ceilingUsd)} |`,
    );
  }

  const calls = Object.entries(JOURNEY.calls).map(([j, n]) => `${n} ${j}`).join(", ");
  console.log(`\n${JOURNEY.label}: ${calls}`);
  console.log(`  typical                 ${usd(r.journeyTypical)}`);
  console.log(`  every call at its ceiling ${usd(r.journeyCeiling)}   <- hard bound, not a forecast`);
  console.log(`  every call on ${r.topTierModel}  ${usd(r.allTopTier)}`);
  console.log(`\nAt ${CANDIDATES_PER_MONTH} candidates/month:`);
  console.log(`  as tiered      ${usd(r.monthlyTypical)}/month`);
  console.log(`  all top tier   ${usd(r.monthlyAllTopTier)}/month`);
  console.log(`  tiering saves  ${usd(r.monthlyAllTopTier - r.monthlyTypical)}/month`);

  if (r.unmodelled.length) {
    console.log(`\nNOT MODELLED (Anthropic jobs with no assumption): ${r.unmodelled.join(", ")}`);
    console.log("Add them to JOB_ASSUMPTIONS or the totals above understate the bill.");
  }

  console.log("\nPrices and ceilings are read from config. Token counts are ESTIMATED");
  console.log("(chars/4) and prompt sizes, output usage and call counts are ASSUMED.");
  console.log("agent_runs already records the real numbers; one day of traffic replaces all of this.\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main();

/**
 * Capture the PRODUCTION semantic retriever's rankings for the frozen live
 * queries, so the offline metrics can score bge/pgvector — not just the TF-IDF
 * lexical baseline. This is the script evals/README promised.
 *
 *   # needs real creds (writes NOTHING to prod — read-only recall):
 *   SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_URL=… \
 *   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… \
 *     npx tsx evals/retrieval/live/capture.ts
 *
 * For each query it runs BOTH lib/match.ts:recallRoles (single-query) and
 * recallRolesMulti (multi-query union) against the live corpus and writes
 * dataset.semantic.json in the same shape run.ts consumes. It maps the DB role
 * ids back to this eval's `company__title` id space so labels line up.
 *
 * It is NOT run in CI (no secrets there); the lexical live eval gates CI. Run
 * this manually to get the real bge precision@k and paste the aggregate into
 * docs/EVALS.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface LiveCase {
  id: string;
  query: string;
  facets: string[];
  relevant: string[];
}

function slug(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  const need = ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing creds: ${missing.join(", ")}. This script needs live Supabase + Workers AI.`);
    process.exit(2);
  }

  // Imported lazily so the file loads (for typecheck/help) without app env.
  const { recallRoles, recallRolesMulti } = await import("@/lib/match");

  const path = fileURLToPath(new URL("./queries.json", import.meta.url));
  const ds = JSON.parse(readFileSync(path, "utf8")) as { k: number; cases: LiveCase[] };

  const cases = [];
  for (const c of ds.cases) {
    const single = await recallRoles(c.query, ds.k);
    const { candidates } = await recallRolesMulti(c.facets, 36);
    const toId = (r: { company: string; role_title: string }) =>
      `${slug(r.company)}__${slug(r.role_title)}`;
    cases.push({
      id: c.id,
      query: c.query,
      singleRanked: single.map(toId),
      multiRanked: candidates.slice(0, ds.k).map(toId),
      relevant: c.relevant.map((id) => id.replace(/__[0-9a-f]{8}$/, "")), // drop ats suffix
    });
    console.log(`captured ${c.id}: single=${single.length} multi=${candidates.length}`);
  }

  const out = { k: ds.k, capturedAt: new Date().toISOString(), retriever: "bge/pgvector", cases };
  const outPath = fileURLToPath(new URL("./dataset.semantic.json", import.meta.url));
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${cases.length} captured cases → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * archive-pruned.mjs — recover the FULL structured JSON of roles removed by
 * refresh-prune.mjs (from git HEAD) and write them to an append-only archive so
 * the historical corpus is preserved for model training. The live seed/DB stay
 * lean (live-only); the archive holds everything ever seen.
 *
 * Archive layout:  roleos/archive/roles/<company-slug>/<role>.json
 * Each archived doc = the original verbatim + an "_archive" provenance block.
 *
 *   node db/seed/archive-pruned.mjs            # DRY RUN
 *   node db/seed/archive-pruned.mjs --apply
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");
const ROLEOS = "/Users/nikjain/Documents/Applying for AI Roles/roleos";
const MANIFEST = join(ROLEOS, "db", "seed", "pruned-2026-06-28.json");
const ARCHIVE = join(ROLEOS, "archive", "roles");

const { prunedAt, roles } = JSON.parse(readFileSync(MANIFEST, "utf8"));
console.log(`Manifest: ${roles.length} roles pruned at ${prunedAt}`);

let recovered = 0, missing = 0, written = 0;
const fails = [];
for (const r of roles) {
  const seedPath = `seed/roles/${r.slug}/${r.file}`;
  let raw;
  try {
    raw = execFileSync("git", ["show", `HEAD:${seedPath}`], { cwd: ROLEOS, encoding: "utf8" });
  } catch {
    missing++; fails.push(seedPath); continue;
  }
  recovered++;
  const doc = JSON.parse(raw);
  doc._archive = {
    archived_at: prunedAt.slice(0, 10),
    reason: "no_longer_live",
    confirmed_gone_at: "2026-06-28",
    last_seen_open: doc.fetched_at ?? null,
    source: "refresh-prune freshness diff (today-diff.json)",
    original_seed_path: seedPath,
  };
  if (APPLY) {
    const out = join(ARCHIVE, r.slug, r.file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
    written++;
  }
}

console.log(`Recovered from git:    ${recovered}`);
console.log(`Could not recover:     ${missing}${fails.length ? "  → " + fails.slice(0, 5).join(", ") : ""}`);
if (APPLY) console.log(`Archived to disk:      ${written}  → archive/roles/`);
else console.log(`\nDRY RUN — re-run with --apply to write archive/roles/`);

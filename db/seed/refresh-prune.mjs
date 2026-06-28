/**
 * refresh-prune.mjs — remove roles that are no longer live.
 *
 * Policy (Nik, 2026-06-28): keep ONLY currently-open postings. A role that the
 * freshness diff reports as CLOSED (its company scanned OK, but the posting URL is
 * gone from the live ATS) is hard-removed from BOTH the seed files and public.roles.
 * Companies left with zero roles have their seed dir removed too.
 *
 * Safe: never removes roles from a company that errored/timed out this scan (those
 * aren't in the diff's closed[]). FKs cascade (embeddings, matches) or set null
 * (drafts/applications). Writes a recovery manifest before deleting.
 *
 *   node db/seed/refresh-prune.mjs            # DRY RUN — report only
 *   node db/seed/refresh-prune.mjs --apply    # actually delete
 */
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const ROLEOS = "/Users/nikjain/Documents/Applying for AI Roles/roleos";
const SEED = join(ROLEOS, "seed", "roles");
const DIFF = "/Users/nikjain/Documents/Applying for AI Roles/role-os-archive/pipeline/data/today-diff.json";

// Load .dev.vars (KEY=VALUE, possibly quoted) into env.
for (const line of readFileSync(join(ROLEOS, ".dev.vars"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env");
const db = createClient(url, key, { auth: { persistSession: false } });

// Map a companies.yml name -> seed dir slug (the diff carries the scan name; the
// seed dir is what we must delete files from). Match by board token via the diff.
const diff = JSON.parse(readFileSync(DIFF, "utf8"));

// Build slug->token from seed (re-derive the same way today-diff did, by reading
// each dir's first role url token), so we can find the dir for each closed entry.
function boardToken(s) {
  if (!s) return null;
  const m =
    s.match(/job-boards\.greenhouse\.io\/([a-z0-9_-]+)/i) ||
    s.match(/greenhouse\.io\/(?:v1\/boards\/|boards\/)?([a-z0-9_-]+)/i) ||
    s.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i) ||
    s.match(/(?:jobs|api)\.lever\.co\/(?:v0\/postings\/)?([a-z0-9_-]+)/i);
  return m ? m[1].toLowerCase() : null;
}
const tokenToSlug = new Map();
for (const slug of readdirSync(SEED)) {
  const dir = join(SEED, slug);
  if (!statSync(dir).isDirectory()) continue;
  const files = readdirSync(dir).filter(f => f.endsWith(".json"));
  if (!files.length) continue;
  const doc = JSON.parse(readFileSync(join(dir, files[0]), "utf8"));
  const t = boardToken(doc.url);
  if (t) tokenToSlug.set(t, slug);
}

// Collect closed roles with their seed file path.
const toRemove = [];
for (const c of diff.perCompany) {
  if (!c.closed.length) continue;
  const slug = tokenToSlug.get(c.token);
  for (const r of c.closed) {
    toRemove.push({ company: c.name, slug, url: r.url, title: r.title, file: r.file });
  }
}

// DB connectivity + presence check.
const { count: dbTotal, error: cErr } = await db.from("roles").select("*", { count: "exact", head: true });
if (cErr) throw new Error("DB unreachable: " + cErr.message);
const urls = toRemove.map(r => r.url);
let dbPresent = 0;
for (let i = 0; i < urls.length; i += 100) {
  const { data } = await db.from("roles").select("id").in("url", urls.slice(i, i + 100));
  dbPresent += (data?.length || 0);
}

console.log(`DB roles total:        ${dbTotal}`);
console.log(`Closed to remove:      ${toRemove.length}`);
console.log(`...present in DB:       ${dbPresent}`);
const missingSlug = toRemove.filter(r => !r.slug);
const missingFile = toRemove.filter(r => r.slug && !existsSync(join(SEED, r.slug, r.file)));
console.log(`...seed file missing:   ${missingFile.length}  (no slug match: ${missingSlug.length})`);

// Which company dirs would become empty (zero live roles) -> remove dir.
const stillOpenByCo = new Map(diff.perCompany.map(c => [c.token, c.stillOpenCount + c.new.length]));
const emptyDirs = [...new Set(toRemove.map(r => r.slug).filter(Boolean))]
  .filter(slug => {
    const dir = join(SEED, slug);
    const remaining = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".json")).length : 0;
    const closedHere = toRemove.filter(r => r.slug === slug).length;
    return remaining - closedHere <= 0;
  });
console.log(`Company dirs emptied:   ${emptyDirs.length}${emptyDirs.length ? "  → " + emptyDirs.join(", ") : ""}`);

if (!APPLY) {
  console.log(`\nDRY RUN — nothing deleted. Re-run with --apply to remove.`);
  process.exit(0);
}

// --- APPLY ---
const manifestPath = join(ROLEOS, "db", "seed", "pruned-2026-06-28.json");
writeFileSync(manifestPath, JSON.stringify({ prunedAt: new Date().toISOString(), roles: toRemove, emptyDirs }, null, 2));
console.log(`\nRecovery manifest: ${manifestPath}`);

// 1) ARCHIVE then delete seed files. Never hard-delete without preserving the
//    full structured doc — the archive is the training corpus.
const ARCHIVE = join(ROLEOS, "archive", "roles");
const today = new Date().toISOString().slice(0, 10);
let filesDeleted = 0, archived = 0;
for (const r of toRemove) {
  if (!r.slug) continue;
  const p = join(SEED, r.slug, r.file);
  if (!existsSync(p)) continue;
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc._archive = {
    archived_at: today, reason: "no_longer_live", confirmed_gone_at: today,
    last_seen_open: doc.fetched_at ?? null,
    source: "refresh-prune freshness diff", original_seed_path: `seed/roles/${r.slug}/${r.file}`,
  };
  const out = join(ARCHIVE, r.slug, r.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
  archived++;
  rmSync(p); filesDeleted++;
}
console.log(`Roles archived:        ${archived}  → archive/roles/`);
// 2) remove emptied dirs
for (const slug of emptyDirs) {
  const dir = join(SEED, slug);
  if (existsSync(dir) && readdirSync(dir).filter(f => f.endsWith(".json")).length === 0) rmSync(dir, { recursive: true });
}
// 3) delete DB rows by url (chunked)
let dbDeleted = 0;
for (let i = 0; i < urls.length; i += 100) {
  const chunk = urls.slice(i, i + 100);
  const { data, error } = await db.from("roles").delete().in("url", chunk).select("id");
  if (error) throw new Error("DB delete failed: " + error.message);
  dbDeleted += data?.length || 0;
}
console.log(`Seed files deleted:    ${filesDeleted}`);
console.log(`Empty dirs removed:    ${emptyDirs.length}`);
console.log(`DB rows deleted:       ${dbDeleted}`);
console.log(`\nDone. public.roles now ~${dbTotal - dbDeleted} (was ${dbTotal}).`);

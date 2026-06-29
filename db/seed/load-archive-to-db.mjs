/**
 * load-archive-to-db.mjs — upsert the file archive (archive/roles/**) into the
 * public.roles_archive table so the off-market corpus is queryable for training,
 * alongside the durable file copy. Idempotent (upsert on url). Service-role.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROLEOS = "/Users/nikjain/Documents/Applying for AI Roles/roleos";
const ARCHIVE = join(ROLEOS, "archive", "roles");
for (const l of readFileSync(join(ROLEOS, ".dev.vars"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const rows = [];
for (const slug of readdirSync(ARCHIVE)) {
  const dir = join(ARCHIVE, slug);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    rows.push({
      company: String(doc.company ?? "Unknown"),
      role_title: String(doc.role_title ?? "Unknown"),
      url: doc.url ?? null,
      ats_provider: doc.ats_provider ?? null,
      source: doc._archive?.source ?? "refresh-prune",
      doc,
      archived_at: doc._archive?.archived_at ? new Date(doc._archive.archived_at).toISOString() : new Date().toISOString(),
    });
  }
}
console.log(`Loading ${rows.length} archived docs…`);
let up = 0;
for (let i = 0; i < rows.length; i += 100) {
  const chunk = rows.slice(i, i + 100);
  const { error, count } = await db.from("roles_archive").upsert(chunk, { onConflict: "url", count: "exact" });
  if (error) throw new Error(error.message);
  up += chunk.length;
}
const { count } = await db.from("roles_archive").select("*", { count: "exact", head: true });
console.log(`Upserted ${up}; roles_archive now has ${count} rows.`);

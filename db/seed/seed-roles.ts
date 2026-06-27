/**
 * Seed the 557 structured roles into public.roles (service-role; bypasses RLS).
 * Idempotent: upserts on source_path. Run: `npm run seed:roles`.
 *
 * Reads seed/roles/<company>/<role>.json (copied from role-os-archive). Each
 * file maps to extracted columns + the full doc (source of truth).
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(process.cwd(), "seed", "roles");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

function toRow(doc: Record<string, unknown>, path: string) {
  const flags =
    doc.green_flags || doc.red_flags
      ? { green_flags: doc.green_flags ?? [], red_flags: doc.red_flags ?? [] }
      : null;
  return {
    company: String(doc.company ?? "Unknown"),
    role_title: String(doc.role_title ?? "Unknown"),
    url: (doc.url as string) ?? null,
    ats_provider: (doc.ats_provider as string) ?? null,
    ats_job_id: (doc.ats_job_id as string) ?? null,
    archetype: (doc.archetype as string) ?? null,
    seniority: doc.seniority ?? null,
    location: doc.location ?? null,
    must_haves: doc.must_haves ?? [],
    nice_to_haves: doc.nice_to_haves ?? [],
    scope: doc.scope ?? null,
    comp: doc.compensation ?? null,
    flags,
    keywords: doc.top_keywords ?? null,
    doc,
    source_path: relative(join(process.cwd(), "seed"), path),
    fetched_at: (doc.fetched_at as string) ?? null,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const files = walk(ROOT);
  console.log(`Seeding ${files.length} roles…`);

  let n = 0;
  for (const batchStart of range(0, files.length, 100)) {
    const rows = files
      .slice(batchStart, batchStart + 100)
      .map((f) => toRow(JSON.parse(readFileSync(f, "utf8")), f));
    const { error } = await db.from("roles").upsert(rows, { onConflict: "source_path" });
    if (error) throw error;
    n += rows.length;
    console.log(`  ${n}/${files.length}`);
  }
  console.log("Done. Next: npm run seed:embeddings");
}

function* range(start: number, end: number, step: number) {
  for (let i = start; i < end; i += step) yield i;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

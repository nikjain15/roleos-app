import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * INVARIANT (stress-test harness, Slice 11): every user-owned table has RLS
 * enabled. This is the durable guard behind the "cross-user RLS probe" scenario —
 * if a future migration adds a table with a `user_id` column but forgets
 * `enable row level security`, this fails the build before it can leak data.
 *
 * Static analysis of the migration SQL — no live DB needed, runs in CI.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../db/migrations", import.meta.url));

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

/** Tables that are deliberately NOT user-owned (global read-only / admin / anon). */
const NON_USER_TABLES = new Set([
  "roles",
  "role_embeddings",
  "companies",
  "roles_archive",
  "ingestion_runs",
  "public_index_stats",
  "index_ask_events",
]);

describe("RLS coverage invariant", () => {
  const sql = allMigrationSql();

  // Find every `create table public.X ( ... )` block and whether it has a user_id column.
  const tableBlocks = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)];

  it("finds the expected core user tables (sanity that the parser works)", () => {
    const names = tableBlocks.map((m) => m[1]);
    for (const t of ["goals", "applications", "taste_dimensions", "artifacts", "matches"]) {
      expect(names, `parser should see ${t}`).toContain(t);
    }
  });

  it("every table with a user_id column has RLS enabled", () => {
    const offenders: string[] = [];
    for (const [, name, body] of tableBlocks) {
      if (NON_USER_TABLES.has(name)) continue;
      const hasUserId = /\buser_id\b/.test(body);
      if (!hasUserId) continue;
      const rlsEnabled = new RegExp(
        `alter table public\\.${name}\\s+enable row level security`,
      ).test(sql);
      if (!rlsEnabled) offenders.push(name);
    }
    expect(offenders, `user tables missing RLS: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the new-this-revamp user tables have owner select + insert + update policies", () => {
    for (const t of ["goals", "applications", "taste_dimensions"]) {
      expect(new RegExp(`create policy ${t}_owner_sel`).test(sql), `${t} owner_sel`).toBe(true);
      expect(new RegExp(`create policy ${t}_owner_ins`).test(sql), `${t} owner_ins`).toBe(true);
      expect(new RegExp(`create policy ${t}_owner_upd`).test(sql), `${t} owner_upd`).toBe(true);
    }
  });
});

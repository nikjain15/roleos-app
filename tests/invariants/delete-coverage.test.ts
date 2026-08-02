import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { USER_DATA_TABLES } from "@/lib/account-delete";

/**
 * INVARIANT (A2): every table that holds rows belonging to one user is either
 * deleted by the delete path or explicitly, deliberately excluded here.
 *
 * The failure this guards against is the quiet one: a future migration adds a
 * user-owned table, nobody thinks about deletion, and "delete everything" starts
 * lying. Same static approach as `rls-coverage.test.ts` (parse the migration SQL,
 * no live database), so it runs in CI.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../db/migrations", import.meta.url));

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

/**
 * User-referencing tables that the delete path does NOT purge, each with the
 * reason. Anything added here must also be named in `NOT_COVERED_BY_DELETE`,
 * which is what the settings screen and the privacy notice show the user.
 */
const DELIBERATELY_NOT_DELETED: Record<string, string> = {
  agent_runs:
    "Cost/latency telemetry. FK is ON DELETE SET NULL, so the row survives unattributed. Holds no prompt text. Aged out by the retention purge.",
};

describe("delete-coverage invariant", () => {
  const sql = allMigrationSql();
  const tableBlocks = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)];

  it("sees the migration tables (sanity that the parser works)", () => {
    const names = tableBlocks.map((m) => m[1]);
    expect(names).toContain("master_profile");
    expect(names).toContain("connections");
    expect(names).toContain("agent_runs");
  });

  it("every table referencing auth.users is deleted or explicitly excluded", () => {
    const unhandled: string[] = [];
    for (const [, name, body] of tableBlocks) {
      if (!/references auth\.users/.test(body)) continue;
      if (USER_DATA_TABLES.includes(name)) continue;
      if (name in DELIBERATELY_NOT_DELETED) continue;
      unhandled.push(name);
    }
    expect(
      unhandled,
      `user-owned tables with no deletion decision: ${unhandled.join(", ")}. Add them to USER_DATA_TABLES in lib/account-delete.ts, or to DELIBERATELY_NOT_DELETED here AND to NOT_COVERED_BY_DELETE.`,
    ).toEqual([]);
  });

  it("does not claim to delete a table that no migration creates", () => {
    const names = new Set(tableBlocks.map((m) => m[1]));
    const phantom = USER_DATA_TABLES.filter((t) => !names.has(t));
    expect(phantom, `listed for deletion but never created: ${phantom.join(", ")}`).toEqual([]);
  });
});

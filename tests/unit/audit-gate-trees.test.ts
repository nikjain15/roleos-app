import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { TREES } from "../../scripts/audit-gate.mjs";

/**
 * THE AUDIT GATE MUST SEE EVERY DEPENDENCY TREE (H4, second defect).
 *
 * The defect this covers was live. `scripts/audit-gate.mjs` ran a single
 * `npm audit` in the repository root and printed "0 high/critical prod
 * advisories". GitHub's security tab reported two high advisories at the same
 * moment. Both were correct: there are three package-lock.json files in this
 * repo, and the gate was reading one of them.
 *
 * That is a worse failure than a missing gate. A gate that audits a subset and
 * prints an unqualified verdict actively produces confidence, and the two
 * numbers cannot be reconciled by anyone who does not already know the gate's
 * scope. The expiry rule in audit-gate-expiry.test.ts stops an exception from
 * rotting; this one stops the SCOPE from rotting, which is the same class of
 * problem one level up.
 *
 * So: adding a lockfile to this repository and forgetting to add it to TREES
 * fails here. It cannot be caught at runtime, because a tree the gate does not
 * know about is a tree the gate cannot report on.
 */

const REPO_ROOT = resolve(__dirname, "../..");
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "coverage", ".vercel"]);

/** Every directory under the repo holding a package-lock.json, repo-relative. */
function findLockedTrees(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const child = join(dir, entry.name);
    if (existsSync(join(child, "package-lock.json"))) {
      found.push(relative(REPO_ROOT, child));
    }
    findLockedTrees(child, found);
  }
  return found;
}

describe("audit gate · every dependency tree is in scope", () => {
  it("lists the repo root", () => {
    expect(TREES).toContain(".");
  });

  it("covers every package-lock.json in the working tree", () => {
    const onDisk = findLockedTrees(REPO_ROOT);
    const missing = onDisk.filter((t) => !TREES.includes(t));

    expect(
      missing,
      `These dependency trees have a package-lock.json and are NOT audited by ` +
        `scripts/audit-gate.mjs. Add them to TREES, or the gate will keep printing a ` +
        `whole-repo verdict it did not earn: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("does not list a tree that no longer exists", () => {
    const stale = TREES.filter((t) => !existsSync(resolve(REPO_ROOT, t, "package-lock.json")));

    expect(
      stale,
      `TREES names directories with no package-lock.json. npm audit will fail there and ` +
        `the gate exits 1 rather than passing quietly, so this is a red build waiting to ` +
        `happen: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("knows about the two sandbox trees that exposed the bug", () => {
    // Named explicitly rather than left to the sweep above. These are the exact two
    // trees whose `sharp` advisories the gate could not see, and a future change that
    // drops them from TREES should have to delete this assertion on purpose.
    expect(TREES).toContain("sandbox/studio");
    expect(TREES).toContain("sandbox/spike/cf-sandbox");
  });
});

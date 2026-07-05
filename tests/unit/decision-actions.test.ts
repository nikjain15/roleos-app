import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * decision_events is the append-only substrate everything learns from — a
 * write that violates its `action` check constraint fails SILENTLY (callers
 * fire-and-forget). X1's audit found every 'rematch' event since W-era had
 * been dropped this way (action 'recompute' isn't a legal verb). This guard
 * greps every decision_events insert in the codebase and pins its action to
 * the 0001 constraint list, so an illegal verb fails CI instead of quietly
 * losing the taste-model's history.
 */
const ALLOWED = new Set(["send", "skip", "edit", "reject", "correct", "approve", "view"]);

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsFiles(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("decision_events writes", () => {
  it("every insert in app/ + lib/ uses a check-constraint-legal action", () => {
    const offenders: string[] = [];
    for (const file of [...tsFiles("app"), ...tsFiles("lib")]) {
      const src = readFileSync(file, "utf8");
      if (!src.includes('from("decision_events")')) continue;
      // Literal action values in insert payloads within this file.
      for (const m of src.matchAll(/action:\s*"([a-z_]+)"/g)) {
        if (!ALLOWED.has(m[1])) offenders.push(`${file}: action "${m[1]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

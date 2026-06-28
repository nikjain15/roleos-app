import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * INVARIANT: no server secret can reach the browser bundle. A "use client"
 * component must never import a module that pulls in the service-role key,
 * server env, or the agent/LLM layer — those are server-only. (Verified once by
 * grepping the built bundle for secret values; this keeps it from regressing.)
 */
const ROOTS = ["app", "components"];
const FORBIDDEN = [
  "lib/supabase/service",
  "@/lib/env",
  "@/lib/google-auth",
  "@/lib/google",
  "@/lib/digest",
  "@/lib/agent-runs",
  "@/lib/profile-fetcher",
  "@/lib/match",
  "@/lib/run-match",
  "@/agent/registry",
  "@/agent/skills/run",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(e)) out.push(p);
  }
  return out;
}

describe("invariant · no server secrets reachable from the client", () => {
  it("no 'use client' file imports a server-only (secret-bearing) module", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, "utf8");
        const head = src.slice(0, 60);
        if (!/^\s*["']use client["']/.test(head)) continue;
        for (const mod of FORBIDDEN) {
          if (src.includes(`"${mod}`) || src.includes(`'${mod}`)) {
            offenders.push(`${file} → ${mod}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

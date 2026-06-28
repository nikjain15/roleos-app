/**
 * embed-until-done.mjs — run embed-roles.ts repeatedly until all roles are
 * embedded. The Workers AI HTTP/2 keep-alive intermittently drops after a few
 * batches ("fetch failed"); embed-roles is resumable, so we just re-invoke until
 * the remaining count is 0. Loads .dev.vars so env is present each pass.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

for (const l of readFileSync(".dev.vars", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

for (let pass = 1; pass <= 10; pass++) {
  const r = spawnSync("npx", ["tsx", "db/seed/embed-roles.ts"], { env: process.env, encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const remain = out.match(/embedding (\d+) remaining/);
  const upToDate = /already embedded; embedding 0 remaining|All embeddings|embedding 0 remaining/.test(out);
  const lastProg = (out.match(/\s(\d+)\/(\d+)/g) || []).pop() || "(no progress line)";
  console.log(`pass ${pass}: start-remaining=${remain ? remain[1] : "?"} lastProgress=${lastProg.trim()}`);
  if (upToDate || (remain && remain[1] === "0")) { console.log("✅ all embedded"); break; }
  if (!remain && /already embedded/.test(out) === false) {
    console.log("unexpected output:\n" + out.slice(-400)); break;
  }
}

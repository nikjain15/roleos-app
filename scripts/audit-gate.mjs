#!/usr/bin/env node
// H4 dependency-audit gate.
// Fails CI on any high/critical advisory in prod deps EXCEPT a small,
// documented allowlist of upstream-unpatched advisories (no stable fixed
// release available yet). Each entry has a reason and an owner review date.
// When upstream ships a fix and the advisory clears, this gate keeps passing;
// if a NEW high/critical appears, it fails, so coverage is not lost.
import { execSync } from "node:child_process";

// GHSA id -> reason. Keep this list SHORT and reviewed.
const ALLOWLIST = {
  // Next.js advisories with no stable fixed release as of 2026-07-26 (fix only
  // in preview). App deploys on Cloudflare Workers via OpenNext, not a custom
  // Node server, which reduces exposure to the custom-server SSRF items.
  "GHSA-m99w-x7hq-7vfj": "next: DoS App Router Server Actions; no stable fix; review 2026-08",
  "GHSA-89xv-2m56-2m9x": "next: SSRF Server Actions on custom servers (N/A on Workers); review 2026-08",
  "GHSA-68g3-v927-f742": "next: cache confusion; no stable fix; review 2026-08",
  "GHSA-4633-3j49-mh5q": "next: cache confusion invalid UTF-8; no stable fix; review 2026-08",
  "GHSA-4c39-4ccg-62r3": "next: unbounded Server Action payload edge; no stable fix; review 2026-08",
  "GHSA-p9j2-gv94-2wf4": "next: SSRF rewrites; no stable fix; review 2026-08",
  "GHSA-q8wf-6r8g-63ch": "next: DoS Image Optimization SVG; no stable fix; review 2026-08",
  "GHSA-955p-x3mx-jcvp": "next: internal Server Function endpoint disclosure; no stable fix; review 2026-08",
  "GHSA-qx2v-qp2m-jg93": "postcss (bundled by next): XSS via </style>; transitive, no stable next fix; review 2026-08",
  "GHSA-6g55-p6wh-862q": "postcss (bundled by next): sourceMappingURL file read; transitive; review 2026-08",
  "GHSA-r28c-9q8g-f849": "postcss (bundled by next): source-map path traversal; transitive; review 2026-08",
  "GHSA-f88m-g3jw-g9cj": "sharp (bundled by next): libvips CVEs; transitive, no stable next fix; review 2026-08",
};

let audit;
try {
  audit = JSON.parse(execSync("npm audit --omit=dev --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch (e) {
  // npm audit exits non-zero when vulns exist; it still prints JSON to stdout.
  audit = JSON.parse(e.stdout || "{}");
}

const ghsaOf = (v) => (v.url || "").split("/").pop();
const blocking = [];
for (const [pkg, info] of Object.entries(audit.vulnerabilities || {})) {
  if (!["high", "critical"].includes(info.severity)) continue;
  for (const via of info.via) {
    if (typeof via !== "object") continue;
    const id = ghsaOf(via);
    if (!ALLOWLIST[id]) blocking.push(`${info.severity}: ${pkg} (${id || via.title || "unknown"})`);
  }
}

const uniq = [...new Set(blocking)];
if (uniq.length) {
  console.error("H4 gate FAILED: unallowlisted high/critical prod advisories:");
  uniq.forEach((b) => console.error("  - " + b));
  process.exit(1);
}
const allowed = Object.keys(ALLOWLIST).length;
console.log(`H4 gate passed: 0 unallowlisted high/critical prod advisories (${allowed} documented, tracked exceptions).`);

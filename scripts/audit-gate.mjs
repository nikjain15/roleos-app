#!/usr/bin/env node
// H4 dependency-audit gate.
//
// Fails CI on any high/critical advisory in prod deps EXCEPT a small, documented
// allowlist of upstream-unpatched advisories (no stable fixed release yet).
//
// EXPIRY IS ENFORCED. Every allowlist entry carries a machine-readable `expires`
// date. Past that date the entry stops suppressing anything and the gate FAILS,
// so a temporary exception cannot quietly become permanent. That was a real
// defect: the previous version of this file carried twelve entries whose review
// window ("review 2026-08") had arrived, and nothing noticed, because the window
// lived in a prose string no code ever read.
//
// To renew an entry you must state a NEW expiry and a NEW reason. To retire one,
// delete it. Both are deliberate acts; neither happens by the calendar moving.
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every dependency tree in this repository, by directory.
 *
 * This list exists because the gate used to be a single `npm audit` in the repo root,
 * and reported "0 vulnerabilities" while GitHub reported two high advisories. Both were
 * true. There are three lockfiles here and the gate was reading one of them, so its
 * silence was about scope, not about safety. A gate that audits a subset of the repo
 * and prints a whole-repo verdict is worse than no gate, because the number looks
 * complete.
 *
 * Adding a lockfile to the repo and not to this list will not be caught automatically.
 * `tests/unit/audit-gate-trees.test.ts` walks the working tree for package-lock.json
 * files and fails if any is missing here, which is the closest thing to automatic that
 * does not require a network call.
 *
 * @type {string[]}
 */
export const TREES = [".", "sandbox/studio", "sandbox/spike/cf-sandbox"];

/** Per-tree line for the pass message, so the scope of the verdict is visible. */
function countAdvisories(audit) {
  const totals = audit?.metadata?.vulnerabilities ?? {};
  const high = (totals.high ?? 0) + (totals.critical ?? 0);
  const rest = (totals.moderate ?? 0) + (totals.low ?? 0);
  return `${high} high/critical, ${rest} moderate/low (prod deps)`;
}

/** @type {string[]} */
const treeSummaries = [];

/**
 * High/critical advisories that exist only in DEV dependencies, per tree.
 *
 * These do not gate, and that is the deliberate policy: a libvips CVE inside the local
 * Workers emulator is a fact about a laptop, not about anything a user loads. But they
 * are printed, because GitHub's Dependabot does NOT split prod from dev, so the repo
 * and the security tab will show different numbers and somebody has to be able to see
 * why without re-deriving it. Silence here is what made "npm audit says zero" and
 * "Dependabot says two highs" both true and mutually unintelligible.
 *
 * @type {string[]}
 */
const devOnlyHighs = [];

/** Every high/critical GHSA id in an audit payload. */
function highIdsOf(audit) {
  const out = new Map();
  for (const [pkg, info] of Object.entries(audit?.vulnerabilities || {})) {
    if (!["high", "critical"].includes(info.severity)) continue;
    for (const via of info.via) {
      if (typeof via !== "object") continue;
      const id = (via.url || "").split("/").pop();
      if (id) out.set(id, `${info.severity}: ${pkg} (${id})`);
    }
  }
  return out;
}

/**
 * GHSA id -> { reason, expires (YYYY-MM-DD), triaged (YYYY-MM-DD) }.
 *
 * Keep this list SHORT and reviewed. An entry belongs here only when BOTH hold:
 *   1. there is no fixed release we can actually install (checked, not assumed), and
 *   2. someone has written down why the residual exposure is acceptable here.
 *
 * If a fix exists, install it. `overrides` in package.json is a legitimate way to
 * pull a patched transitive dependency through a parent that pins an old one, and
 * it is how the postcss and sharp entries that used to sit here were retired.
 *
 * @type {Record<string, { reason: string; expires: string; triaged: string }>}
 */
const ALLOWLIST = {
  // Empty, and that is the honest state as of the 2026-08-02 re-triage, not an
  // oversight. All twelve former entries were resolved:
  //   - eight next advisories: fixed upstream in the 15.5.x backport line already
  //     installed (next@15.5.22). npm audit no longer reports them at all.
  //   - three postcss advisories: fixed in postcss 8.5.18+. next pins 8.4.31, so
  //     package.json `overrides` pulls 8.5.25 through it.
  //   - one sharp advisory (the libvips CVEs): fixed in sharp 0.35.0+. next's
  //     optional dep floats at ^0.34.3, so `overrides` pulls 0.35.3.
  // `npm audit --omit=dev` reports zero vulnerabilities at any severity across
  // all three trees in TREES. Corrected 2026-08-02: that sentence used to say
  // "zero" on the strength of a root-only audit, while Dependabot reported two
  // high sharp advisories in the sandbox trees this gate never opened. Both
  // numbers were right. See TREES above and docs/DECISION_LOG.md.
  //
  // The gate below is therefore load-bearing on its own: the next high or
  // critical advisory to appear fails the build with nothing suppressing it.
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How far out an expiry may be set. Six months is the ceiling; parking an entry
 * beyond that is a decision to stop looking, not a review window.
 */
export const MAX_WINDOW_DAYS = 180;

/**
 * Validate the allowlist BEFORE it is allowed to suppress anything. Pure, so the
 * expiry rule itself is unit-testable (tests/unit/audit-gate-expiry.test.ts) even
 * when the shipped allowlist is empty, which it currently is.
 *
 * @param {Record<string, unknown>} allowlist
 * @param {string} today YYYY-MM-DD
 * @returns {{ ok: boolean; malformed: string[]; expired: string[]; tooFar: string[] }}
 */
export function validateAllowlist(allowlist, today) {
  const malformed = [];
  const expired = [];
  const tooFar = [];
  for (const [id, entry] of Object.entries(allowlist)) {
    if (!entry || typeof entry !== "object") {
      malformed.push(`${id}: entry must be an object with { reason, expires, triaged }`);
      continue;
    }
    if (!entry.reason || typeof entry.reason !== "string") malformed.push(`${id}: missing a reason`);
    let datesOk = true;
    for (const field of ["expires", "triaged"]) {
      const v = entry[field];
      if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
        malformed.push(`${id}: ${field} must be a real YYYY-MM-DD date (got ${JSON.stringify(v)})`);
        datesOk = false;
      }
    }
    if (!datesOk) continue;
    if (entry.expires < today) {
      expired.push(`${id}: expired ${entry.expires} - ${entry.reason}`);
    } else if ((Date.parse(entry.expires) - Date.parse(today)) / 86_400_000 > MAX_WINDOW_DAYS) {
      tooFar.push(`${id}: expires ${entry.expires}, more than ${MAX_WINDOW_DAYS} days out`);
    }
  }
  return { ok: !malformed.length && !expired.length && !tooFar.length, malformed, expired, tooFar };
}

/** The gate proper. Only runs when this file is executed, never on import. */
function main() {
  const TODAY = new Date().toISOString().slice(0, 10);

  // 1 - the allowlist must be well formed and in date, or nothing is suppressed.
  const check = validateAllowlist(ALLOWLIST, TODAY);
  if (check.malformed.length) {
    console.error("H4 gate FAILED: the allowlist is malformed:");
    check.malformed.forEach((m) => console.error("  - " + m));
    console.error("\nEvery entry needs { reason, expires: 'YYYY-MM-DD', triaged: 'YYYY-MM-DD' }.");
    process.exit(1);
  }
  if (check.expired.length) {
    console.error("H4 gate FAILED: allowlist entries are past their expiry date:");
    check.expired.forEach((e) => console.error("  - " + e));
    console.error(
      `\nToday is ${TODAY}. Re-triage each one: check whether a fixed release now exists\n` +
        "(install it, or pull it through with a package.json override), then either DELETE\n" +
        "the entry or renew it with a new expires date and a reason that says what changed.\n" +
        "Renewing by bumping the date alone is not a re-triage.",
    );
    process.exit(1);
  }
  if (check.tooFar.length) {
    console.error(`H4 gate FAILED: an allowlist expiry is more than ${MAX_WINDOW_DAYS} days out:`);
    check.tooFar.forEach((t) => console.error("  - " + t));
    process.exit(1);
  }

  // 2 - run the audit, once per dependency tree.
  const ghsaOf = (v) => (v.url || "").split("/").pop();
  const blocking = [];
  const suppressed = new Set();

  for (const tree of TREES) {
    let audit;
    try {
      audit = JSON.parse(
        execSync("npm audit --omit=dev --json", {
          cwd: resolve(REPO_ROOT, tree),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }),
      );
    } catch (e) {
      // npm audit exits non-zero when vulns exist; it still prints JSON to stdout.
      // An empty stdout means the command itself failed (missing lockfile, no network),
      // which must not read as a clean tree.
      if (!e.stdout) {
        console.error(`H4 gate FAILED: could not audit ${tree}. npm audit produced no JSON.`);
        console.error(String(e.stderr || e.message || e).trim());
        process.exit(1);
      }
      audit = JSON.parse(e.stdout);
    }

    const label = tree === "." ? "root" : tree;
    treeSummaries.push(`${label}: ${countAdvisories(audit)}`);

    // The same tree again, dev included, purely to report. Never gates.
    let full;
    try {
      full = JSON.parse(
        execSync("npm audit --json", {
          cwd: resolve(REPO_ROOT, tree),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }),
      );
    } catch (e) {
      full = e.stdout ? JSON.parse(e.stdout) : null;
    }
    if (full) {
      const prodHighs = highIdsOf(audit);
      for (const [id, desc] of highIdsOf(full)) {
        if (!prodHighs.has(id)) devOnlyHighs.push(`${desc} in ${label}`);
      }
    }

    for (const [pkg, info] of Object.entries(audit.vulnerabilities || {})) {
      if (!["high", "critical"].includes(info.severity)) continue;
      for (const via of info.via) {
        if (typeof via !== "object") continue;
        const id = ghsaOf(via);
        if (ALLOWLIST[id]) suppressed.add(id);
        else blocking.push(`${info.severity}: ${pkg} (${id || via.title || "unknown"}) in ${label}`);
      }
    }
  }

  const uniq = [...new Set(blocking)];
  if (uniq.length) {
    console.error("H4 gate FAILED: unallowlisted high/critical prod advisories:");
    uniq.forEach((b) => console.error("  - " + b));
    process.exit(1);
  }

  // 3 - report. The per-tree lines are printed on a pass as well as a failure, so the
  // scope of "0 vulnerabilities" is never left to the reader's assumption.
  console.log(`H4 gate audited ${TREES.length} dependency trees:`);
  treeSummaries.forEach((s) => console.log("  - " + s));

  if (devOnlyHighs.length) {
    console.log(
      `\nNot gated, and reported so the number reconciles with GitHub's security tab.\n` +
        `Dependabot counts dev dependencies; this gate does not. ${devOnlyHighs.length} high/critical\n` +
        `advisor${devOnlyHighs.length === 1 ? "y is" : "ies are"} dev-only:`,
    );
    devOnlyHighs.forEach((d) => console.log("  - " + d));
  }

  const entries = Object.entries(ALLOWLIST);
  if (entries.length === 0) {
    console.log("H4 gate passed: 0 high/critical prod advisories, and the allowlist is empty.");
  } else {
    console.log(
      `H4 gate passed: 0 unallowlisted high/critical prod advisories (${entries.length} documented exception${entries.length === 1 ? "" : "s"}, all inside their expiry window).`,
    );
    for (const [id, e] of entries) {
      const stale = suppressed.has(id) ? "" : "  [NOT CURRENTLY REPORTED - candidate for deletion]";
      console.log(`  - ${id} expires ${e.expires}: ${e.reason}${stale}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();

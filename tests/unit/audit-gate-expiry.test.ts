import { describe, it, expect } from "vitest";
import { validateAllowlist, MAX_WINDOW_DAYS } from "../../scripts/audit-gate.mjs";

/**
 * THE ALLOWLIST EXPIRY RULE (H4 / finding A6).
 *
 * The defect this covers was live: `scripts/audit-gate.mjs` carried twelve
 * dependency-audit exceptions whose review window was written as the English
 * string "review 2026-08", and no code ever read it. The window arrived, every
 * entry kept suppressing its advisory, and the gate kept printing "passed". An
 * exception designed to expire did not.
 *
 * The fix is a machine-readable `expires` date that the gate ENFORCES. This test
 * is what keeps the enforcement honest, because the shipped allowlist is now
 * empty (every entry was fixed rather than renewed), so nothing in the repo would
 * otherwise exercise the rule. Delete this test and the expiry logic goes back to
 * being decorative.
 */
type Entry = { reason: string; expires: string; triaged: string };
const ok = (over: Partial<Entry> = {}): Entry => ({
  reason: "upstream has no fixed release",
  expires: "2026-09-01",
  triaged: "2026-08-02",
  ...over,
});

describe("audit gate · allowlist expiry is enforced, not decorative", () => {
  it("accepts a well-formed, in-date entry", () => {
    const r = validateAllowlist({ "GHSA-aaaa-bbbb-cccc": ok() }, "2026-08-02");
    expect(r.ok).toBe(true);
    expect(r.expired).toEqual([]);
  });

  it("FAILS an entry whose expiry has passed", () => {
    const r = validateAllowlist({ "GHSA-aaaa-bbbb-cccc": ok({ expires: "2026-08-01" }) }, "2026-08-02");
    expect(r.ok).toBe(false);
    expect(r.expired).toHaveLength(1);
    expect(r.expired[0]).toContain("GHSA-aaaa-bbbb-cccc");
  });

  it("treats the expiry date itself as the last valid day, not the first invalid one", () => {
    expect(validateAllowlist({ x: ok({ expires: "2026-08-02" }) }, "2026-08-02").ok).toBe(true);
    expect(validateAllowlist({ x: ok({ expires: "2026-08-02" }) }, "2026-08-03").ok).toBe(false);
  });

  it("would have failed on the exact allowlist that shipped before this fix", () => {
    // The twelve real entries carried no date field at all, only prose. Modelled
    // here as the shape they actually had, which must be rejected as malformed.
    const legacy = {
      "GHSA-m99w-x7hq-7vfj": "next: DoS App Router Server Actions; no stable fix; review 2026-08",
      "GHSA-qx2v-qp2m-jg93": "postcss (bundled by next): XSS via </style>; review 2026-08",
    };
    const r = validateAllowlist(legacy, "2026-08-02");
    expect(r.ok).toBe(false);
    expect(r.malformed.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a missing or non-date expiry rather than ignoring the field", () => {
    for (const bad of [undefined, "", "soon", "2026-08", "2026-13-40", 20260802]) {
      const r = validateAllowlist({ x: { ...ok(), expires: bad as string } }, "2026-08-02");
      expect(r.ok, `expires=${String(bad)} should be rejected`).toBe(false);
      expect(r.malformed.join(" ")).toContain("expires");
    }
  });

  it("rejects an entry with no stated reason", () => {
    const r = validateAllowlist({ x: { expires: "2026-09-01", triaged: "2026-08-02" } }, "2026-08-02");
    expect(r.ok).toBe(false);
    expect(r.malformed.join(" ")).toContain("reason");
  });

  it("rejects an expiry parked beyond the review ceiling (no dodging the re-triage)", () => {
    const far = new Date(Date.parse("2026-08-02") + (MAX_WINDOW_DAYS + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const r = validateAllowlist({ x: ok({ expires: far }) }, "2026-08-02");
    expect(r.ok).toBe(false);
    expect(r.tooFar).toHaveLength(1);
  });

  it("reports every offending entry, not just the first", () => {
    const r = validateAllowlist(
      {
        a: ok({ expires: "2026-01-01" }),
        b: ok({ expires: "2026-02-01" }),
        c: ok(),
      },
      "2026-08-02",
    );
    expect(r.expired).toHaveLength(2);
  });

  it("an empty allowlist is valid, nothing to review is a real state", () => {
    expect(validateAllowlist({}, "2026-08-02").ok).toBe(true);
  });
});

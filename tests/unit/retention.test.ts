import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RETENTION_RULES, purgePlan, windowLabel } from "@/lib/retention";

/**
 * Retention (A2). The point of this file is that the windows are a PROPERTY OF
 * CODE, not of prose: the purge job and the privacy page both read
 * `RETENTION_RULES`, so a window nothing enforces cannot exist. That was the
 * exact failure recorded in FounderFirst and again in docs/STAKEHOLDERS.md.
 */

describe("purgePlan", () => {
  const now = new Date("2026-08-02T03:00:00.000Z");

  it("resolves each rule to a cutoff exactly `days` before now", () => {
    for (const { rule, cutoff } of purgePlan(now)) {
      const expected = new Date(now.getTime() - rule.days * 86_400_000).toISOString();
      expect(cutoff, rule.table).toBe(expected);
    }
  });

  it("covers every rule, once", () => {
    const plan = purgePlan(now);
    expect(plan).toHaveLength(RETENTION_RULES.length);
    expect(new Set(plan.map((p) => p.rule.table)).size).toBe(RETENTION_RULES.length);
  });

  it("never produces a cutoff in the future (which would delete live rows)", () => {
    for (const { cutoff } of purgePlan(now)) {
      expect(Date.parse(cutoff)).toBeLessThan(now.getTime());
    }
  });

  it("moves with the clock rather than being pinned to a build date", () => {
    const later = new Date(now.getTime() + 86_400_000);
    expect(purgePlan(later)[0].cutoff).not.toBe(purgePlan(now)[0].cutoff);
  });
});

describe("the rules themselves", () => {
  it("are all positive, finite windows with a stated reason", () => {
    for (const r of RETENTION_RULES) {
      expect(r.days, r.table).toBeGreaterThan(0);
      expect(Number.isFinite(r.days), r.table).toBe(true);
      expect(r.why.length, r.table).toBeGreaterThan(20);
      expect(r.column.length, r.table).toBeGreaterThan(0);
    }
  });

  it("keep the IP-keyed abuse counters short", () => {
    for (const table of ["rate_events", "index_ask_events"]) {
      const rule = RETENTION_RULES.find((r) => r.table === table);
      expect(rule, `${table} must have a window: it stores IP addresses`).toBeDefined();
      expect(rule!.days).toBeLessThanOrEqual(30);
    }
  });

  it("only purge notifications the user has already seen", () => {
    const rule = RETENTION_RULES.find((r) => r.table === "notifications");
    expect(rule?.onlyStatusIn).toEqual({ column: "status", values: ["read", "dismissed"] });
  });

  it("do not time-box anything the user wrote", () => {
    const authored = ["master_profile", "artifacts", "decision_events", "connections", "ro_memory"];
    for (const t of authored) {
      expect(
        RETENTION_RULES.some((r) => r.table === t),
        `${t} must not be on a timer: it holds what the user wrote, and it goes on delete instead`,
      ).toBe(false);
    }
  });

  it("labels a window in plain words", () => {
    expect(windowLabel({ table: "x", column: "c", days: 1, why: "y" })).toBe("1 day");
    expect(windowLabel({ table: "x", column: "c", days: 7, why: "y" })).toBe("7 days");
  });
});

describe("the purge job is wired to a schedule (a window nothing runs is prose)", () => {
  const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

  it("the cron worker calls /api/cron/purge", () => {
    expect(read("../../cron/worker.ts")).toContain("/api/cron/purge");
  });

  it("the purge route deletes from the shared rules, not its own copy", () => {
    const route = read("../../app/api/cron/purge/route.ts");
    expect(route).toContain("purgePlan");
    expect(route).toContain("@/lib/retention");
  });

  it("the privacy page renders the same rules it purges on", () => {
    const page = read("../../app/(public)/privacy/page.tsx");
    expect(page).toContain("RETENTION_RULES");
    expect(page).toContain("@/lib/retention");
  });
});

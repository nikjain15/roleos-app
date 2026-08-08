import { describe, it, expect } from "vitest";
import { RESCAN_INTERVAL_MS, nextScanAt, pageAll, shouldRequeue } from "@/lib/ingest/scan";

/**
 * Re-scan cadence. The corpus is only as fresh as this: before it existed a
 * company scanned once was never revisited, so closed roles lingered and
 * anything posted after the first sweep never landed. The adaptive half keeps
 * that sweep short — boards that never yield in-scope roles step back so the
 * productive ones aren't queued behind them.
 */
const NOW = Date.parse("2026-08-08T14:00:00Z");
const DAY = 24 * 3_600_000;
const daysOut = (streak: number) => (Date.parse(nextScanAt(streak, NOW)) - NOW) / DAY;

describe("nextScanAt", () => {
  it("puts a productive company back in three days", () => {
    expect(daysOut(0)).toBe(3);
    expect(RESCAN_INTERVAL_MS).toBe(3 * DAY);
  });

  it("doubles the wait for each consecutive empty scan", () => {
    expect(daysOut(1)).toBe(6);
    expect(daysOut(2)).toBe(12);
    expect(daysOut(3)).toBe(24);
  });

  it("caps the backoff so a quiet company is still checked monthly", () => {
    expect(daysOut(9)).toBe(24);
    expect(daysOut(100)).toBe(24);
  });

  it("treats a negative or missing streak as fresh rather than compounding", () => {
    expect(daysOut(-1)).toBe(3);
  });

  it("returns an ISO timestamp Postgres can compare against next_scan_at", () => {
    expect(nextScanAt(0, NOW)).toBe("2026-08-11T14:00:00.000Z");
  });
});

/**
 * Company-list paging. The scan used to read a flat `.limit(500)` and the YC
 * enable ceiling was sized to stay under it — so growing the company list past
 * 500 would have silently dropped companies from every sweep rather than failing.
 */
describe("pageAll", () => {
  const pageOf = (rows: number[], from: number, to: number) => rows.slice(from, to + 1);

  it("drains a list larger than one page", async () => {
    const rows = Array.from({ length: 2350 }, (_, i) => i);
    const got = await pageAll(async (f, t) => pageOf(rows, f, t), 1000);
    expect(got).toHaveLength(2350);
    expect(got[0]).toBe(0);
    expect(got[2349]).toBe(2349);
  });

  it("returns everything when the list fits in one page", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => i);
    expect(await pageAll(async (f, t) => pageOf(rows, f, t), 1000)).toHaveLength(12);
  });

  it("handles an exact multiple of the page size without looping forever", async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => i);
    let calls = 0;
    const got = await pageAll(async (f, t) => { calls++; return pageOf(rows, f, t); }, 1000);
    expect(got).toHaveLength(2000);
    expect(calls).toBe(3); // two full pages, then an empty one proves the end
  });

  it("is empty, not stuck, when there are no rows", async () => {
    expect(await pageAll(async () => [], 1000)).toEqual([]);
  });
});

/**
 * Partial-ingest re-queue. A reconcile request dies around 60s of wall clock and
 * each role costs ~6s, so a big board only ever gets ~8 roles in — and used to
 * report HTTP 200 with `added: 8` and stamp itself 3 days out, dripping a
 * 65-role backlog in over three weeks. Companies with work left now come
 * straight back, but only while they're actually making progress.
 */
describe("shouldRequeue", () => {
  it("comes back for a company with more roles waiting", () => {
    expect(shouldRequeue(8, 57)).toBe(true);
  });

  it("does not requeue when the board is fully ingested", () => {
    expect(shouldRequeue(8, 0)).toBe(false);
    expect(shouldRequeue(0, 0)).toBe(false);
  });

  it("refuses to requeue a company making no progress, however much is pending", () => {
    // Every insert failing (dead board, embed outage) must not starve the sweep.
    expect(shouldRequeue(0, 500)).toBe(false);
  });
});

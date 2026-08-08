import { describe, it, expect } from "vitest";
import { RESCAN_INTERVAL_MS, nextScanAt } from "@/lib/ingest/scan";

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

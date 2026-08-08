import { describe, it, expect } from "vitest";
import { RESCAN_INTERVAL_MS, staleCutoff } from "@/lib/ingest/scan";

/**
 * Re-scan cadence. The corpus is only as fresh as this cutoff: before it existed
 * a company scanned once was never revisited, so closed roles lingered and
 * anything posted after the first sweep never landed.
 */
const NOW = Date.parse("2026-08-08T14:00:00Z");

describe("staleCutoff", () => {
  it("sits exactly one rescan interval behind now", () => {
    expect(Date.parse(staleCutoff(NOW))).toBe(NOW - RESCAN_INTERVAL_MS);
  });

  it("is an ISO timestamp Postgres can compare against last_scanned_at", () => {
    expect(staleCutoff(NOW)).toBe("2026-08-05T14:00:00.000Z");
  });

  it("keeps a just-scanned company fresh and marks an old one due", () => {
    const cutoff = Date.parse(staleCutoff(NOW));
    const scannedAnHourAgo = NOW - 3_600_000;
    const scannedSixWeeksAgo = NOW - 42 * 24 * 3_600_000;
    expect(scannedAnHourAgo < cutoff).toBe(false);
    expect(scannedSixWeeksAgo < cutoff).toBe(true);
  });

  it("re-scans every company at least twice a week", () => {
    expect(RESCAN_INTERVAL_MS).toBeLessThanOrEqual(3.5 * 24 * 3_600_000);
  });
});

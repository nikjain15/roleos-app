import { describe, it, expect } from "vitest";
import {
  isHuntDue,
  isDormant,
  selectHuntTargets,
  huntSummary,
  HUNT_INTERVAL_MS,
  HUNT_DRAFTS_PER_USER,
  type HuntableMatch,
} from "@/lib/hunt";

/**
 * Overnight hunt (slice X1) — the pure logic: who gets hunted (throttle, pause,
 * dormancy), which roles get drafted (fresh pursues only, user decisions and
 * existing work respected), and what RO says about it (honest, calm copy).
 */

const NOW = Date.parse("2026-07-04T02:30:00Z");

describe("isHuntDue", () => {
  it("hunts a fresh user (no ambient state)", () => {
    expect(isHuntDue(null, NOW)).toBe(true);
    expect(isHuntDue({}, NOW)).toBe(true);
  });

  it("respects the pause switch above everything", () => {
    expect(isHuntDue({ hunt_paused: true }, NOW)).toBe(false);
    expect(
      isHuntDue({ hunt_paused: true, last_hunt_at: new Date(NOW - 48 * 3_600_000).toISOString() }, NOW),
    ).toBe(false);
  });

  it("throttles to one hunt per 20h and recovers after", () => {
    const tenHoursAgo = new Date(NOW - 10 * 3_600_000).toISOString();
    const twentyOneHoursAgo = new Date(NOW - 21 * 3_600_000).toISOString();
    expect(isHuntDue({ last_hunt_at: tenHoursAgo }, NOW)).toBe(false);
    expect(isHuntDue({ last_hunt_at: twentyOneHoursAgo }, NOW)).toBe(true);
    expect(HUNT_INTERVAL_MS).toBe(20 * 3_600_000);
  });

  it("treats a malformed timestamp as due (never wedged forever)", () => {
    expect(isHuntDue({ last_hunt_at: "not-a-date" }, NOW)).toBe(true);
  });
});

describe("isDormant", () => {
  it("a user with no decisions yet is dormant (no spend, no noise)", () => {
    expect(isDormant(null, NOW)).toBe(true);
    expect(isDormant(undefined, NOW)).toBe(true);
  });

  it("recent activity keeps the hunt alive; 30+ quiet days stops it", () => {
    expect(isDormant(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe(false);
    expect(isDormant(new Date(NOW - 31 * 86_400_000).toISOString(), NOW)).toBe(true);
  });

  it("garbage timestamps read as dormant (fail toward spending nothing)", () => {
    expect(isDormant("garbage", NOW)).toBe(true);
  });
});

describe("selectHuntTargets", () => {
  const m = (role_id: string, fit: number | null, rec = "pursue", status = "new"): HuntableMatch => ({
    role_id,
    fit_score: fit,
    recommendation: rec,
    status,
  });

  it("picks only FRESH pursue matches, best fit first, capped", () => {
    const picks = selectHuntTargets(
      [m("a", 70), m("b", 90), m("c", 80), m("d", 95, "maybe"), m("e", 99, "pursue", "saved")],
      new Set(),
    );
    expect(picks).toEqual(["b", "c"]); // maybe/d and user-touched/e never drafted
    expect(picks.length).toBeLessThanOrEqual(HUNT_DRAFTS_PER_USER);
  });

  it("never re-drafts roles the user already tracks or has a résumé for", () => {
    expect(selectHuntTargets([m("a", 90), m("b", 80)], new Set(["a"]))).toEqual(["b"]);
  });

  it("handles empty input, null fit, and a zero cap without drama", () => {
    expect(selectHuntTargets([], new Set())).toEqual([]);
    expect(selectHuntTargets([m("a", null), m("b", 10)], new Set())).toEqual(["b", "a"]);
    expect(selectHuntTargets([m("a", 90)], new Set(), 0)).toEqual([]);
  });
});

describe("huntSummary", () => {
  it("one ready draft: names the role, promises the human gate", () => {
    const { title, body } = huntSummary([{ company: "Acme", role_title: "Staff PM", ready: true }]);
    expect(title).toContain("Staff PM");
    expect(title).toContain("Acme");
    expect(body).toContain("Ready queue");
    expect(body).toContain("Nothing goes out without you.");
  });

  it("mixed results are reported honestly — flagged drafts ask for eyes", () => {
    const { title, body } = huntSummary([
      { company: "Acme", role_title: "Staff PM", ready: true },
      { company: "Beta", role_title: "Principal PM", ready: false },
    ]);
    expect(title).toContain("2 résumés");
    expect(body).toContain("needs your eyes");
    expect(body).toContain("Ready queue");
  });

  it("never manufactures urgency — no deadline theater in the copy", () => {
    const { title, body } = huntSummary([{ company: "Acme", role_title: "PM", ready: false }]);
    for (const s of [title, body]) {
      expect(/urgent|hurry|act now|don't miss|expires/i.test(s)).toBe(false);
    }
  });
});

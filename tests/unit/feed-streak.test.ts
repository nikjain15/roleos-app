import { describe, it, expect } from "vitest";
import { activeDays, computeStreak, momentumToday, weekRow, prevDay, dayKey } from "@/lib/feed/streak";

const ev = (d: string, weight?: number) => ({ created_at: `${d}T12:00:00Z`, weight });

describe("dayKey / prevDay", () => {
  it("extracts the UTC calendar day and steps back across months", () => {
    expect(dayKey("2026-07-01T23:30:00Z")).toBe("2026-07-01");
    expect(prevDay("2026-07-01")).toBe("2026-06-30");
    expect(prevDay("2026-01-01")).toBe("2025-12-31");
  });
});

describe("computeStreak", () => {
  it("counts consecutive active days ending today", () => {
    const a = activeDays([ev("2026-07-22"), ev("2026-07-23"), ev("2026-07-24"), ev("2026-07-25")]);
    expect(computeStreak(a, "2026-07-25")).toBe(4);
  });

  it("stays alive on a day with no move yet (counts from yesterday)", () => {
    const a = activeDays([ev("2026-07-23"), ev("2026-07-24")]);
    expect(computeStreak(a, "2026-07-25")).toBe(2); // today's move not in yet, streak intact
  });

  it("breaks on a gap", () => {
    const a = activeDays([ev("2026-07-20"), ev("2026-07-21"), ev("2026-07-24"), ev("2026-07-25")]);
    expect(computeStreak(a, "2026-07-25")).toBe(2); // 24 + 25 only; 22/23 gap
  });

  it("is 0 when neither today nor yesterday had a move", () => {
    const a = activeDays([ev("2026-07-20")]);
    expect(computeStreak(a, "2026-07-25")).toBe(0);
  });
});

describe("momentumToday", () => {
  it("sums today's weights and ignores other days", () => {
    const events = [ev("2026-07-25", 3), ev("2026-07-25", 1), ev("2026-07-24", 9)];
    expect(momentumToday(events, "2026-07-25")).toBe(4);
  });
  it("falls back to 1 per weightless event", () => {
    expect(momentumToday([ev("2026-07-25"), ev("2026-07-25")], "2026-07-25")).toBe(2);
  });
});

describe("weekRow", () => {
  it("returns 7 trailing days ending today with active/today/future flags", () => {
    const a = activeDays([ev("2026-07-24"), ev("2026-07-25")]);
    const row = weekRow(a, "2026-07-25");
    expect(row).toHaveLength(7);
    expect(row[6]).toMatchObject({ date: "2026-07-25", isToday: true, active: true });
    expect(row[5]).toMatchObject({ date: "2026-07-24", active: true, isToday: false });
    expect(row[0].date).toBe("2026-07-19");
    expect(row.every((d) => !d.isFuture)).toBe(true); // trailing window, none future
  });
});

import { computePath, weeklyMoves } from "@/lib/feed/model";

describe("computePath", () => {
  it("marks stages done cumulatively and sets the frontier as current", () => {
    const p = computePath({ found: 13, stages: ["applied", "interviewing", "screening", "saved"] });
    const by = Object.fromEntries(p.map((s) => [s.key, s]));
    expect(by.found).toMatchObject({ count: 13, done: true });
    expect(by.applied.count).toBe(3); // applied + interviewing + screening (saved excluded)
    expect(by.interviewing.count).toBe(2); // interviewing + screening
    expect(by.finals.done).toBe(false);
    expect(by.interviewing.current).toBe(true); // furthest reached
    expect(p.filter((s) => s.current)).toHaveLength(1);
  });
  it("offer becomes the frontier when present", () => {
    const p = computePath({ found: 5, stages: ["offer"] });
    expect(p.find((s) => s.key === "offer")?.current).toBe(true);
  });
});

describe("weeklyMoves", () => {
  it("compares the trailing 7 days to the prior 7 for the pace ratio", () => {
    const events = [
      ev("2026-07-25"), ev("2026-07-24"), ev("2026-07-23"), ev("2026-07-22"), // this week (4)
      ev("2026-07-17"), ev("2026-07-16"), // last week (2)
    ];
    const r = weeklyMoves(events, "2026-07-25");
    expect(r.thisWeek).toBe(4);
    expect(r.lastWeek).toBe(2);
    expect(r.ratio).toBe(2);
  });
  it("ratio is null when last week had no moves", () => {
    expect(weeklyMoves([ev("2026-07-25")], "2026-07-25").ratio).toBeNull();
  });
});

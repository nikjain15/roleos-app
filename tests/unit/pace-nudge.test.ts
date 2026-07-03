import { describe, it, expect } from "vitest";
import { buildPaceNudge } from "@/lib/pace-nudge";
import { decideNotification, DEFAULT_QUIET_HOURS, DEFAULT_NOTIF_SETTINGS } from "@/lib/notifications";
import { computePlan, addDays } from "@/lib/plan/plan";
import type { Goal } from "@/lib/plan/types";

const today = "2026-07-03";
const planFor = (goal: Goal, supply = 100) => computePlan(goal, { today, liveSupply: supply });

describe("buildPaceNudge", () => {
  it("stays silent when on track (wellbeing over engagement)", () => {
    const p = planFor({ deadline_date: "2026-12-01", intensity: { apps_per_week_ceiling: 30 } }, 200);
    expect(buildPaceNudge(p, false)).toBeNull();
  });

  it("stays silent with no deadline (never a generic nudge)", () => {
    expect(buildPaceNudge(planFor({}), false)).toBeNull();
  });

  it("nudges when off-track, leading with the lever and no guilt language", () => {
    const p = planFor({ deadline_date: addDays(today, 14), deadline_hard: true }, 100);
    const n = buildPaceNudge(p, true);
    expect(n).not.toBeNull();
    expect(n!.title.toLowerCase()).not.toMatch(/haven't|streak|don't fall behind|come back/);
    expect(n!.body).toContain(p.feasibility.bestLever);
    expect(n!.candidate.kind).toBe("pace");
  });

  it("a hard slipping deadline is time-sensitive (can raise volume); a soft one is not", () => {
    const off = planFor({ deadline_date: addDays(today, 10), deadline_hard: true });
    expect(buildPaceNudge(off, true)!.candidate.timeSensitive).toBe(true);

    const atRisk = planFor({ deadline_date: addDays(today, 45), intensity: { apps_per_week_ceiling: 2 } });
    // at_risk (not off_track) → never time-sensitive → routes to digest, not push
    const n = buildPaceNudge(atRisk, false);
    expect(n!.candidate.timeSensitive).toBe(false);
  });

  it("routes through the notifications engine respecting wellbeing rules", () => {
    const off = planFor({ deadline_date: addDays(today, 10), deadline_hard: true });
    const nudge = buildPaceNudge(off, true)!;
    // Quiet hours + hard deadline → still delivered, but gently.
    const d = decideNotification(nudge.candidate, {
      settings: DEFAULT_NOTIF_SETTINGS,
      quiet: DEFAULT_QUIET_HOURS,
      localHour: 23, // quiet
      isWeekend: false,
      pushesSentToday: 0,
      pushesSentThisWeek: 0,
    });
    expect(d.gentle).toBe(true);
    // cadence 'open' → never interrupts even a pace nudge
    const open = decideNotification(nudge.candidate, {
      settings: { cadence: "open" },
      quiet: DEFAULT_QUIET_HOURS,
      localHour: 12,
      isWeekend: false,
      pushesSentToday: 0,
      pushesSentThisWeek: 0,
    });
    expect(open.tier).toBe("in_feed");
  });
});

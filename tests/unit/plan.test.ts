import { describe, it, expect } from "vitest";
import { computeRates, PRIORS } from "@/lib/plan/rates";
import { computePlan, daysBetween, addDays } from "@/lib/plan/plan";
import { computeAgenda } from "@/lib/plan/agenda";
import type { Goal } from "@/lib/plan/types";

describe("computeRates (empirical-Bayes)", () => {
  it("returns the prior mean when there's no personal data", () => {
    const r = computeRates();
    expect(r.apply_to_screen.mid).toBeCloseTo(PRIORS.apply_to_screen.mean, 5);
    expect(r.apply_to_screen.n).toBe(0);
    expect(r.apply_to_screen.low).toBeLessThan(r.apply_to_screen.mid);
    expect(r.apply_to_screen.high).toBeGreaterThan(r.apply_to_screen.mid);
  });

  it("shrinks toward personal rate as trials accrue", () => {
    // 100 apps, 50 screens → personal 0.5, well above the 0.3 prior.
    const r = computeRates({ apply_to_screen: { conversions: 50, trials: 100 } });
    expect(r.apply_to_screen.mid).toBeGreaterThan(PRIORS.apply_to_screen.mean);
    expect(r.apply_to_screen.mid).toBeLessThan(0.5); // shrunk, not all the way
    expect(r.apply_to_screen.n).toBe(100);
    // more data → tighter band
    expect(r.apply_to_screen.high - r.apply_to_screen.low).toBeLessThan(0.3);
  });
});

describe("date helpers", () => {
  it("daysBetween + addDays are inverse and tz-safe", () => {
    expect(daysBetween("2026-07-03", "2026-08-02")).toBe(30);
    expect(addDays("2026-07-03", 30)).toBe("2026-08-02");
    expect(daysBetween("2026-07-03", "2026-07-03")).toBe(0);
  });
});

const today = "2026-07-03";

describe("computePlan", () => {
  it("builds a backward funnel with honest ranges (offer ⇐ onsites ⇐ screens ⇐ apps)", () => {
    const goal: Goal = { deadline_date: "2026-09-01", intensity: { apps_per_week_ceiling: 20 } };
    const p = computePlan(goal, { today, liveSupply: 100 });
    expect(p.funnel.offers).toBe(1);
    expect(p.funnel.onsites.mid).toBeLessThan(p.funnel.screens.mid);
    expect(p.funnel.screens.mid).toBeLessThan(p.funnel.applications.mid);
    expect(p.funnel.applications.low).toBeLessThanOrEqual(p.funnel.applications.mid);
    expect(p.funnel.applications.high).toBeGreaterThanOrEqual(p.funnel.applications.mid);
    // cited priors: ~50 targeted apps → ~6 first interviews → ~3 finals → 1 offer
    expect(p.funnel.applications.mid).toBeGreaterThan(30);
    expect(p.funnel.applications.mid).toBeLessThan(80);
    expect(p.funnel.screens.mid).toBeGreaterThanOrEqual(4);
    expect(p.funnel.onsites.mid).toBeGreaterThanOrEqual(2);
  });

  it("front-loads the apply-by date before the deadline (lead time)", () => {
    const goal: Goal = { deadline_date: "2026-09-01" };
    const p = computePlan(goal, { today, liveSupply: 100 });
    expect(p.applyByDate).toBe(addDays("2026-09-01", -28));
    expect(daysBetween(p.applyByDate!, "2026-09-01")).toBe(28);
  });

  it("flags off_track when the deadline is shorter than one interview cycle", () => {
    const goal: Goal = { deadline_date: addDays(today, 14), deadline_hard: true };
    const p = computePlan(goal, { today, liveSupply: 100 });
    expect(p.feasibility.verdict).toBe("off_track");
    expect(p.feasibility.bestLever).toMatch(/extend/i);
  });

  it("flags at_risk/off_track when required pace exceeds the intensity ceiling", () => {
    // tight but > one cycle; low ceiling forces a shortfall
    const goal: Goal = { deadline_date: addDays(today, 45), intensity: { apps_per_week_ceiling: 2 } };
    const p = computePlan(goal, { today, liveSupply: 100 });
    expect(["at_risk", "off_track"]).toContain(p.feasibility.verdict);
    expect(p.feasibility.requiredAppsPerWeek).toBeGreaterThan(2);
  });

  it("flags at_risk when live role supply can't feed the funnel", () => {
    const goal: Goal = { deadline_date: "2026-10-01", intensity: { apps_per_week_ceiling: 50 } };
    const p = computePlan(goal, { today, liveSupply: 5 });
    expect(p.feasibility.verdict).toBe("at_risk");
    expect(p.feasibility.bestLever).toMatch(/broaden/i);
  });

  it("is on_track with a roomy deadline, supply, and ceiling", () => {
    const goal: Goal = { deadline_date: "2026-12-01", intensity: { apps_per_week_ceiling: 30 } };
    const p = computePlan(goal, { today, liveSupply: 200 });
    expect(p.feasibility.verdict).toBe("on_track");
    expect(p.weekly.applications).toBeGreaterThan(0);
    expect(p.phases).toHaveLength(4);
  });

  it("handles a missing deadline honestly (no false pace)", () => {
    const p = computePlan({}, { today, liveSupply: 100 });
    expect(p.feasibility.verdict).toBe("no_deadline");
    expect(p.applyByDate).toBeNull();
    expect(p.weekly.applications).toBe(0);
  });
});

describe("computeAgenda", () => {
  const onTrack = computePlan(
    { deadline_date: "2026-12-01", intensity: { apps_per_week_ceiling: 30 } },
    { today, liveSupply: 200 },
  );

  it("prompts to set a goal when there's no deadline", () => {
    const noGoal = computePlan({}, { today, liveSupply: 100 });
    const a = computeAgenda({ plan: noGoal, pursueRoles: 0, readyArtifacts: 0, appsThisWeek: 0 });
    expect(a[0].id).toBe("set-goal");
  });

  it("leads with the best lever when off pace", () => {
    const risky = computePlan(
      { deadline_date: addDays(today, 45), intensity: { apps_per_week_ceiling: 2 } },
      { today, liveSupply: 100 },
    );
    const a = computeAgenda({ plan: risky, pursueRoles: 3, readyArtifacts: 1, appsThisWeek: 0 });
    expect(a[0].id).toBe("lever");
    expect(a[0].priority).toBe(100);
  });

  it("surfaces sending ready applications (min of pace and ready), ranked by impact", () => {
    const a = computeAgenda({ plan: onTrack, pursueRoles: 10, readyArtifacts: 3, appsThisWeek: 0 });
    const send = a.find((i) => i.id === "send");
    expect(send).toBeTruthy();
    // weekly pace is the cap: send min(weeklyApps, readyArtifacts)
    const n = Math.min(onTrack.weekly.applications, 3);
    expect(send!.title).toBe(`Review + send ${n} ready application${n === 1 ? "" : "s"}`);
    // sorted desc by priority
    expect(a[0].priority).toBeGreaterThanOrEqual(a[a.length - 1].priority);
  });

  it("never dead-ends: on-pace with nothing pending still returns a move", () => {
    const a = computeAgenda({ plan: onTrack, pursueRoles: 999, readyArtifacts: 0, appsThisWeek: 999 });
    expect(a.length).toBeGreaterThan(0);
  });
});

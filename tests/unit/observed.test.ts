import { describe, it, expect } from "vitest";
import { observedFromApplications, furthestRank } from "@/lib/plan/observed";
import { computeRates } from "@/lib/plan/rates";

const app = (stage: string, history: string[] = []) => ({
  stage,
  stage_history: history.map((s) => ({ stage: s })),
});

describe("furthestRank", () => {
  it("takes the furthest stage reached, even after a rejection", () => {
    expect(furthestRank(app("rejected", ["applied", "screening", "onsite", "rejected"]))).toBe(6);
    expect(furthestRank(app("applied", ["saved", "applied"]))).toBe(3);
    expect(furthestRank(app("saved"))).toBe(0);
  });
});

describe("observedFromApplications", () => {
  it("is empty when nothing has been applied yet (leave it to priors)", () => {
    const o = observedFromApplications([app("saved"), app("drafting"), app("ready")]);
    expect(o).toEqual({});
  });

  it("computes conversions at the furthest stage reached per application", () => {
    const apps = [
      app("applied"), // applied, no screen
      app("screening"), // applied + screen
      app("rejected", ["applied", "screening", "rejected"]), // reached screen, no onsite
      app("offer", ["applied", "screening", "onsite", "offer"]), // full funnel
    ];
    const o = observedFromApplications(apps);
    // 4 reached applied; 3 reached screen
    expect(o.apply_to_screen).toEqual({ conversions: 3, trials: 4 });
    // 3 reached screen; 1 reached onsite
    expect(o.screen_to_onsite).toEqual({ conversions: 1, trials: 3 });
    // 1 reached onsite; 1 reached offer
    expect(o.onsite_to_offer).toEqual({ conversions: 1, trials: 1 });
  });

  it("feeds computeRates and moves the rate off the pure prior", () => {
    const apps = Array.from({ length: 50 }, () => app("screening", ["applied", "screening"]));
    const o = observedFromApplications(apps); // 50/50 apply→screen = 100%
    const r = computeRates(o);
    expect(r.apply_to_screen.n).toBe(50);
    expect(r.apply_to_screen.mid).toBeGreaterThan(0.12); // pulled up from the 0.12 prior
  });
});

import { describe, it, expect } from "vitest";
import { deriveDimensions, DIMENSIONS, type Signals } from "@/lib/dimensions";
import { computeRates } from "@/lib/plan/rates";

const empty: Signals = {
  saves: 0, dismisses: 0, pursues: 0, resumeEdits: 0, resumeApproves: 0,
  rates: null, cadence: null, intensity: null,
};

describe("deriveDimensions", () => {
  it("always returns all 15 dimensions in order", () => {
    const d = deriveDimensions(empty);
    expect(d).toHaveLength(15);
    expect(d.map((x) => x.id)).toEqual(DIMENSIONS.map((x) => x.id));
  });

  it("is honest with no signal — null inference, low confidence, never fabricated", () => {
    const d = deriveDimensions(empty);
    expect(d.every((x) => x.inference === null)).toBe(true);
    expect(d.every((x) => x.confidence <= 0.15)).toBe(true);
    expect(d.every((x) => typeof x.basis === "string" && x.basis.length > 0)).toBe(true);
  });

  it("infers selectivity from curate actions with rising confidence", () => {
    const d = deriveDimensions({ ...empty, saves: 1, pursues: 1, dismisses: 8 });
    const fit = d.find((x) => x.key === "archetype_fit")!;
    expect(fit.inference).toMatch(/selective/i);
    expect(fit.confidence).toBeGreaterThan(0.3);
  });

  it("reads cadence as high-confidence (an explicit user choice)", () => {
    const d = deriveDimensions({ ...empty, cadence: "weekly" });
    const c = d.find((x) => x.key === "cadence")!;
    expect(c.inference).toContain("weekly");
    expect(c.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("reports funnel calibration from real rates, or honest priors when n=0", () => {
    const priors = deriveDimensions({ ...empty, rates: computeRates() });
    const f0 = priors.find((x) => x.key === "funnel_calibration")!;
    expect(f0.inference).toMatch(/benchmark|prior/i);

    const withData = deriveDimensions({
      ...empty,
      rates: computeRates({ apply_to_screen: { conversions: 6, trials: 40 } }),
    });
    const f1 = withData.find((x) => x.key === "funnel_calibration")!;
    expect(f1.inference).toMatch(/apply→interview/i);
    expect(f1.confidence).toBeGreaterThan(0.3);
  });

  it("reads effort from goal intensity", () => {
    const d = deriveDimensions({ ...empty, intensity: { apps_per_week_ceiling: 8, hours_per_week: 10 } });
    const e = d.find((x) => x.key === "effort_intensity")!;
    expect(e.inference).toContain("8 apps/week");
  });
});

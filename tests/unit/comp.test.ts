import { describe, it, expect } from "vitest";
import { compareOffers, DEFAULT_WEIGHTS, parseOffers, summarizeRanges, type Offer } from "@/lib/comp";

/** X5 — comp math, pure. */
describe("summarizeRanges", () => {
  it("percentiles over midpoints of valid ranges; junk dropped; honest empty", () => {
    const s = summarizeRanges([[100_000, 120_000], [200_000, 220_000], [150_000, 170_000], null, [0, 0], [-5, 10] as [number, number]]);
    expect(s.n).toBe(3);
    expect(s.p50).toBe(160_000);
    expect(s.p25).toBeLessThanOrEqual(s.p50!);
    expect(s.p75).toBeGreaterThanOrEqual(s.p50!);
    expect(summarizeRanges([])).toEqual({ n: 0, p25: null, p50: null, p75: null });
  });
});

const offer = (name: string, over: Partial<Offer> = {}): Offer => ({
  name, base_usd: 200_000, total_usd: null, equity_note: "", growth: 3, life_fit: 3, mission: 3, ...over,
});

describe("compareOffers", () => {
  it("higher money wins on money-heavy weights; the parts sum to the total", () => {
    const [a, b] = compareOffers([offer("Rich", { base_usd: 250_000 }), offer("Poor", { base_usd: 180_000 })]);
    expect(a.name).toBe("Rich");
    const sum = a.parts.comp + a.parts.growth + a.parts.life_fit + a.parts.mission;
    expect(Math.abs(sum - a.total)).toBeLessThan(0.31); // rounding only
    expect(b.total).toBeLessThan(a.total);
  });

  it("changing weights flips the winner exactly when the math says so", () => {
    const offers = [offer("Money", { base_usd: 260_000, growth: 2 }), offer("Growth", { base_usd: 200_000, growth: 5 })];
    expect(compareOffers(offers, { comp: 60, growth: 10, life_fit: 20, mission: 10 })[0].name).toBe("Money");
    expect(compareOffers(offers, { comp: 10, growth: 60, life_fit: 20, mission: 10 })[0].name).toBe("Growth");
  });

  it("total_usd beats base when present; empty input → empty output", () => {
    const [top] = compareOffers([
      offer("BigTotal", { base_usd: 180_000, total_usd: 400_000 }),
      offer("BigBase", { base_usd: 250_000 }),
    ]);
    expect(top.name).toBe("BigTotal");
    expect(compareOffers([], DEFAULT_WEIGHTS)).toEqual([]);
  });
});

describe("parseOffers — localStorage is untrusted", () => {
  it("round-trips valid offers, drops junk, caps at 3, clamps ratings", () => {
    const good = [offer("A"), offer("B"), offer("C"), offer("D")];
    expect(parseOffers(JSON.stringify(good))).toHaveLength(3);
    expect(parseOffers("not json {{{")).toEqual([]);
    expect(parseOffers(JSON.stringify([{ name: "NoBase" }, { base_usd: 1 }, null, 42]))).toEqual([]);
    const clamped = parseOffers(JSON.stringify([{ name: "X", base_usd: 100_000, growth: 99, life_fit: -3 }]));
    expect(clamped[0].growth).toBe(5);
    expect(clamped[0].life_fit).toBe(1);
  });
});

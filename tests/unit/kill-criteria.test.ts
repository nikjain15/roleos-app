import { describe, expect, it } from "vitest";
import {
  KILL_COST_PER_JOURNEY_USD,
  KILL_MIN_JOURNEYS,
  evaluateKillLine,
  mean,
  median,
  toJourneys,
  type JourneyCost,
} from "@/lib/kill-criteria";

/**
 * The kill line (R1).
 *
 * A kill criterion is only worth writing if it can actually fire, and only worth
 * trusting if it refuses to fire on noise. Both directions are tested, plus the
 * one that would quietly break it: a single runaway journey must NOT cross the
 * line, because that case belongs to the daily budget alert in lib/cost-budget.ts
 * and a criterion that conflates the two would be rationalised away the first
 * time it fired on an incident.
 */

const journeys = (...costs: number[]): JourneyCost[] =>
  costs.map((costUsd, i) => ({ userId: `u${i}`, costUsd }));

/** N journeys all at the same cost. */
const flat = (n: number, cost: number): JourneyCost[] =>
  Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, costUsd: cost }));

describe("median and mean", () => {
  it("median of an odd list is the middle value", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("median of an even list averages the middle pair", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("both are null on an empty list rather than 0", () => {
    // 0 would read as "free", which is a different claim from "unknown".
    expect(median([])).toBeNull();
    expect(mean([])).toBeNull();
  });

  it("median ignores an outlier that drags the mean", () => {
    const costs = [0.8, 0.8, 0.8, 0.8, 900];
    expect(median(costs)).toBe(0.8);
    expect(mean(costs)!).toBeGreaterThan(180);
  });
});

describe("the line holds at normal cost", () => {
  it("holds at the modelled typical journey cost", () => {
    // docs/COST.md models a typical journey at $0.80.
    const v = evaluateKillLine(flat(20, 0.8));
    expect(v.status).toBe("holding");
    expect(v.medianUsd).toBeCloseTo(0.8, 10);
    expect(v.action).toContain("Continue");
  });

  it("holds at the all-at-ceiling bound, which is expensive but legitimate", () => {
    // $1.31 is every call at its ceiling. The line deliberately sits above it,
    // so a genuinely heavy month does not read as a dead product.
    const v = evaluateKillLine(flat(20, 1.31));
    expect(v.status).toBe("holding");
  });

  it("holds exactly at the line, which is 'exceeds', not 'reaches'", () => {
    const v = evaluateKillLine(flat(20, KILL_COST_PER_JOURNEY_USD));
    expect(v.status).toBe("holding");
  });
});

describe("the line fires when the design is structurally too expensive", () => {
  it("crosses when the typical journey is over the line", () => {
    const v = evaluateKillLine(flat(20, 2.5));
    expect(v.status).toBe("crossed");
    expect(v.medianUsd).toBeCloseTo(2.5, 10);
    expect(v.reason).toContain("all-at-ceiling");
  });

  it("names a consequence that is not 'try harder'", () => {
    const v = evaluateKillLine(flat(20, 3));
    expect(v.action).toContain("Narrow to one gate");
    // And explicitly rules out the branch that makes every criterion toothless.
    expect(v.action).toContain("Do not re-tune prompts");
  });
});

describe("one runaway journey is an incident, not a dead product", () => {
  it("does NOT cross on a single pathological journey", () => {
    // 19 healthy candidates and one that burned $500. The mean is over $25;
    // the median is $0.80. This is what lib/cost-budget.ts exists to catch.
    const v = evaluateKillLine([...flat(19, 0.8), { userId: "runaway", costUsd: 500 }]);
    expect(v.status).toBe("holding");
    expect(v.medianUsd).toBeCloseTo(0.8, 10);
    expect(v.meanUsd!).toBeGreaterThan(25);
  });

  it("still reports the mean, so the incident is visible", () => {
    // Not comparing against it is not the same as hiding it.
    const v = evaluateKillLine([...flat(19, 0.8), { userId: "runaway", costUsd: 500 }]);
    expect(v.meanUsd).not.toBeNull();
  });
});

describe("the line refuses an unreadable sample", () => {
  it("will not fire on too few journeys, however expensive they look", () => {
    const v = evaluateKillLine(journeys(50, 60, 70));
    expect(v.status).toBe("not_enough_data");
    expect(v.journeys).toBe(3);
    expect(v.journeys < KILL_MIN_JOURNEYS).toBe(true);
    // The number is still reported, just not acted on.
    expect(v.medianUsd).toBe(60);
    expect(v.action).toContain("not evidence");
  });

  it("handles an empty window", () => {
    const v = evaluateKillLine([]);
    expect(v.status).toBe("not_enough_data");
    expect(v.medianUsd).toBeNull();
    expect(v.meanUsd).toBeNull();
  });
});

describe("toJourneys rolls agent_runs rows into candidates", () => {
  it("sums every run for one user into one journey", () => {
    const out = toJourneys([
      { user_id: "a", cost_usd: 0.3 },
      { user_id: "a", cost_usd: 0.5 },
      { user_id: "b", cost_usd: 1.2 },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((j) => j.userId === "a")!.costUsd).toBeCloseTo(0.8, 10);
  });

  it("drops rows with no user rather than pooling them", () => {
    // A pooled bucket would look like one enormous candidate and could cross the
    // line on its own. user_id is `on delete set null`, so this is a real case.
    const out = toJourneys([
      { user_id: null, cost_usd: 900 },
      { user_id: "a", cost_usd: 0.8 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe("a");
  });

  it("treats a null or unparseable cost as zero rather than NaN", () => {
    const out = toJourneys([
      { user_id: "a", cost_usd: null },
      { user_id: "a", cost_usd: "0.25" },
    ]);
    expect(out[0].costUsd).toBeCloseTo(0.25, 10);
  });

  it("handles numeric strings, which is what the driver returns for numeric columns", () => {
    // agent_runs.cost_usd is `numeric`, and the Supabase client hands those back
    // as strings. Summing them without Number() would concatenate.
    const out = toJourneys([
      { user_id: "a", cost_usd: "0.50" },
      { user_id: "a", cost_usd: "0.75" },
    ]);
    expect(out[0].costUsd).toBeCloseTo(1.25, 10);
  });
});

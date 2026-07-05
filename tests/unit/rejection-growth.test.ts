import { describe, it, expect } from "vitest";
import { buildReflection, REASON_OPTIONS, type ReflectionInput } from "@/lib/rejection-growth";
import { learnLifts, type OutcomeLifts } from "@/lib/outcome-learning";

/** Build a real OutcomeLifts from decided outcomes so tests use the true math. */
function liftsFrom(
  outcomes: Array<[roleId: string, outcome: "win" | "loss"]>,
  featuresByRole: Record<string, string[]>,
): OutcomeLifts {
  return learnLifts(new Map(outcomes), new Map(Object.entries(featuresByRole)));
}

const NO_EVIDENCE: OutcomeLifts = { decided: 0, wins: 0, base: 0, byFeature: new Map() };

function input(over: Partial<ReflectionInput>): ReflectionInput {
  return { features: [], lifts: NO_EVIDENCE, score: null, ...over };
}

describe("buildReflection", () => {
  it("always acknowledges first and always offers the fixed reason set", () => {
    const r = buildReflection(input({}));
    expect(r.acknowledgment.length).toBeGreaterThan(0);
    expect(r.reasonOptions).toBe(REASON_OPTIONS);
    expect(r.reasonOptions.map((o) => o.value)).toEqual([
      "no_response",
      "after_screen",
      "after_interview",
      "role_closed",
      "not_a_fit",
      "other",
    ]);
  });

  it("no-evidence safe floor: honest base-rate line + a steady-pace lever, never a fabricated trend", () => {
    const r = buildReflection(input({ features: ["arch:platform"] }));
    expect(r.dataPoints[0]).toMatch(/one data point/i);
    expect(r.dataPoints[0]).not.toMatch(/\d+%/); // no invented rate with zero evidence
    expect(r.oneAdjustment.lever).toBe("pace");
  });

  it("surfaces the real base rate once there are decided outcomes", () => {
    // 1 win of 2 decided → base 50%.
    const lifts = liftsFrom(
      [
        ["r1", "win"],
        ["r2", "loss"],
      ],
      { r1: ["kw:ai"], r2: ["kw:ai"] },
    );
    const r = buildReflection(input({ features: ["kw:ai"], lifts }));
    expect(r.dataPoints[0]).toMatch(/50%/);
    expect(r.dataPoints[0]).toMatch(/2 applications/);
  });

  it("names a weak feature this role leaned on and recommends the résumé lever", () => {
    // kw:sales loses both times → negative lift; the rejected role has it.
    const lifts = liftsFrom(
      [
        ["a", "loss"],
        ["b", "loss"],
        ["c", "win"],
      ],
      { a: ["kw:sales"], b: ["kw:sales"], c: ["kw:ai"] },
    );
    const r = buildReflection(input({ features: ["kw:sales"], lifts }));
    expect(r.dataPoints.some((d) => /sales/i.test(d) && /tougher/i.test(d))).toBe(true);
    expect(r.oneAdjustment.lever).toBe("resume");
    expect(r.oneAdjustment.text).toMatch(/sales/i);
  });

  it("with no weak feature but a strong one elsewhere, recommends the targeting lever", () => {
    const lifts = liftsFrom(
      [
        ["a", "win"],
        ["b", "win"],
        ["c", "loss"],
      ],
      { a: ["kw:ai"], b: ["kw:ai"], c: ["kw:fintech"] },
    );
    // Rejected role has a feature with NO evidence → falls through to targeting on kw:ai.
    const r = buildReflection(input({ features: ["kw:newthing"], lifts }));
    expect(r.oneAdjustment.lever).toBe("targeting");
    expect(r.oneAdjustment.text).toMatch(/ai/i);
  });

  it("high score → 'near miss' calibration; low score → 'aim higher-fit'", () => {
    const hi = buildReflection(input({ score: { score: 84, likelihood: "high" } }));
    expect(hi.dataPoints.some((d) => /near miss/i.test(d))).toBe(true);
    const lo = buildReflection(input({ score: { score: 41, likelihood: "low" } }));
    expect(lo.dataPoints.some((d) => /higher-fit/i.test(d))).toBe(true);
  });

  it("healthy quality (high-fit near miss, no weak feature) → pace lever, not a false fix", () => {
    const lifts = liftsFrom(
      [
        ["a", "win"],
        ["b", "loss"],
      ],
      { a: ["kw:ai"], b: ["kw:ai"] },
    );
    const r = buildReflection(
      input({ features: ["kw:ai"], lifts, score: { score: 88, likelihood: "high" } }),
    );
    // kw:ai here is 1/2 at base 0.5 → lift 0 → not "weak", not "strong": no fixable gap.
    expect(r.oneAdjustment.lever).toBe("pace");
  });

  it("never emits an empty reflection — always ack + at least one data point + a lever", () => {
    const r = buildReflection(input({}));
    expect(r.dataPoints.length).toBeGreaterThanOrEqual(1);
    expect(r.oneAdjustment.text.length).toBeGreaterThan(0);
  });
});

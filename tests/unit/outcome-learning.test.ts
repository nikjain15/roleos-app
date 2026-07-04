import { describe, it, expect } from "vitest";
import {
  outcomeOf,
  decidedOutcomes,
  roleFeatures,
  learnLifts,
  adjustFit,
  calibrateScores,
  calibrationLine,
  MAX_DELTA,
  type OutcomeApp,
} from "@/lib/outcome-learning";

/**
 * X4 — the outcome-learning math, pure. Wins/losses from the funnel of record,
 * per-feature lifts with small-n shrinkage, bounded explained fit adjustments,
 * and the honest X3 calibration read-back.
 */

const app = (stage: string, history: string[]): OutcomeApp => ({
  role_id: "r1",
  stage,
  stage_history: history.map((s, i) => ({ stage: s, at: `2026-06-0${i + 1}` })),
});

describe("outcomeOf — the funnel's verdict, read gently", () => {
  it("reaching a screen is a win — even if it later ended in rejection", () => {
    expect(outcomeOf(app("screening", ["applied", "screening"]))).toBe("win");
    expect(outcomeOf(app("rejected", ["applied", "screening", "rejected"]))).toBe("win");
    expect(outcomeOf(app("offer", ["applied", "screening", "onsite", "offer"]))).toBe("win");
  });

  it("rejected without a screen is a loss; withdrawn after applying too", () => {
    expect(outcomeOf(app("rejected", ["applied", "rejected"]))).toBe("loss");
    expect(outcomeOf(app("withdrawn", ["applied", "withdrawn"]))).toBe("loss");
  });

  it("silence is not a loss: in-flight and never-sent apps are excluded", () => {
    expect(outcomeOf(app("applied", ["applied"]))).toBe(null); // waiting
    expect(outcomeOf(app("ready", ["saved", "drafting", "ready"]))).toBe(null);
    expect(outcomeOf(app("withdrawn", ["saved", "withdrawn"]))).toBe(null); // never applied
  });

  it("decidedOutcomes skips null role_ids and undecided apps", () => {
    const out = decidedOutcomes([
      { ...app("rejected", ["applied", "rejected"]), role_id: "a" },
      { ...app("applied", ["applied"]), role_id: "b" },
      { ...app("screening", ["applied", "screening"]), role_id: null },
    ]);
    expect([...out.entries()]).toEqual([["a", "loss"]]);
  });
});

describe("roleFeatures — transparent and bounded", () => {
  it("normalizes archetype + keywords, capped and deduped", () => {
    const feats = roleFeatures({
      archetype: " Product Manager ",
      keywords: ["Platform", "platform", "b2b", 42, "", "x1", "x2", "x3", "x4", "x5"],
    });
    expect(feats).toContain("arch:product manager");
    expect(feats).toContain("kw:platform");
    expect(feats).toContain("kw:b2b");
    expect(feats.filter((f) => f.startsWith("kw:")).length).toBeLessThanOrEqual(6);
  });

  it("junk in, nothing out", () => {
    expect(roleFeatures(null)).toEqual([]);
    expect(roleFeatures({ archetype: null, keywords: "not-an-array" })).toEqual([]);
  });
});

describe("learnLifts — counting with shrinkage", () => {
  const outcomes = new Map<string, "win" | "loss">([
    ["a", "win"],
    ["b", "win"],
    ["c", "loss"],
    ["d", "loss"],
  ]);
  const features = new Map<string, string[]>([
    ["a", ["kw:platform"]],
    ["b", ["kw:platform"]],
    ["c", ["kw:ops"]],
    ["d", ["kw:ops", "kw:solo"]],
  ]);

  it("computes base rate and per-feature shrunk lifts; positive where wins cluster", () => {
    const lifts = learnLifts(outcomes, features);
    expect(lifts.decided).toBe(4);
    expect(lifts.base).toBe(0.5);
    // platform: 2/2 vs base 0.5 → (2 − 1) / (2 + 2) = 0.25
    expect(lifts.byFeature.get("kw:platform")?.lift).toBeCloseTo(0.25);
    // ops: 0/2 → (0 − 1) / 4 = −0.25
    expect(lifts.byFeature.get("kw:ops")?.lift).toBeCloseTo(-0.25);
  });

  it("a feature seen once teaches nothing (n<2 floor)", () => {
    const lifts = learnLifts(outcomes, features);
    expect(lifts.byFeature.has("kw:solo")).toBe(false);
  });

  it("no decided outcomes → empty model, zero drama", () => {
    const lifts = learnLifts(new Map(), new Map());
    expect(lifts.decided).toBe(0);
    expect(lifts.byFeature.size).toBe(0);
  });
});

describe("adjustFit — bounded, explained, never silent", () => {
  const lifts = learnLifts(
    new Map<string, "win" | "loss">([
      ["a", "win"],
      ["b", "win"],
      ["c", "loss"],
      ["d", "loss"],
    ]),
    new Map([
      ["a", ["kw:platform"]],
      ["b", ["kw:platform"]],
      ["c", ["kw:ops"]],
      ["d", ["kw:ops"]],
    ]),
  );

  it("adjusts up where the user's wins cluster, with the arithmetic attached", () => {
    const adj = adjustFit(70, ["kw:platform"], lifts);
    expect(adj).not.toBeNull();
    expect(adj!.delta).toBeGreaterThan(0);
    expect(adj!.adjusted).toBe(70 + adj!.delta);
    expect(adj!.because).toEqual([{ feature: "platform", wins: 2, n: 2 }]);
  });

  it("adjusts down on losing features; clamps to ±MAX_DELTA; respects 0/100", () => {
    const down = adjustFit(3, ["kw:ops"], lifts);
    expect(down!.delta).toBeLessThan(0);
    expect(down!.adjusted).toBeGreaterThanOrEqual(0);

    // Pile on many strong features → the clamp holds.
    const many = new Map<string, "win" | "loss">();
    const feats = new Map<string, string[]>();
    for (let i = 0; i < 10; i++) {
      many.set(`w${i}`, "win");
      feats.set(`w${i}`, ["kw:a", "kw:b", "kw:c", "kw:d"]);
      many.set(`l${i}`, "loss");
      feats.set(`l${i}`, ["kw:z"]);
    }
    const big = learnLifts(many, feats);
    const adj = adjustFit(95, ["kw:a", "kw:b", "kw:c", "kw:d"], big);
    expect(adj!.delta).toBeLessThanOrEqual(MAX_DELTA);
    expect(adj!.adjusted).toBeLessThanOrEqual(100);
    expect(adj!.because.length).toBeLessThanOrEqual(3);
  });

  it("no evidence, no fit, or a net-zero read → null (page renders as before)", () => {
    expect(adjustFit(null, ["kw:platform"], lifts)).toBeNull();
    expect(adjustFit(70, ["kw:unseen"], lifts)).toBeNull();
    expect(adjustFit(70, [], lifts)).toBeNull();
  });
});

describe("calibrateScores + calibrationLine — honest read-back", () => {
  const outcomes = new Map<string, "win" | "loss">([
    ["r1", "win"],
    ["r2", "loss"],
    ["r3", "win"],
  ]);

  it("latest score per role, decided outcomes only, bucketed with n", () => {
    const cal = calibrateScores(
      [
        { role_id: "r1", likelihood: "high" }, // newest-first: this wins for r1
        { role_id: "r1", likelihood: "low" },
        { role_id: "r2", likelihood: "high" },
        { role_id: "r3", likelihood: "medium" },
        { role_id: "r9", likelihood: "high" }, // undecided → excluded
        { role_id: "r2", likelihood: "made-up" }, // junk likelihood → ignored
      ],
      outcomes,
    );
    expect(cal.high).toEqual({ n: 2, wins: 1 });
    expect(cal.medium).toEqual({ n: 1, wins: 1 });
    expect(cal.low).toBeUndefined();
  });

  it("the line shows n, hedges small samples, and says nothing without history", () => {
    const cal = calibrateScores([{ role_id: "r1", likelihood: "high" }, { role_id: "r2", likelihood: "high" }], outcomes);
    const line = calibrationLine(cal, "high");
    expect(line).toContain("1/2");
    expect(line).toContain("read gently");
    expect(calibrationLine(cal, "medium")).toBeNull();
    expect(calibrationLine({}, "high")).toBeNull();
    expect(calibrationLine(cal, undefined)).toBeNull();
  });
});

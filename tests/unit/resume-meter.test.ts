import { describe, it, expect } from "vitest";
import { meterView, liftLabel, READINESS_CAVEAT } from "@/lib/resume/meter";
import { scoreResume, type ScoreInput } from "@/lib/resume/score";
import { DEFAULT_CALIBRATION } from "@/lib/resume/calibration";

/**
 * P2 — the readiness-meter view model. Honest tier + track + next move + the
 * non-negotiable caveat; `+N from your master` with an honest sign. Pure.
 */

const cal = DEFAULT_CALIBRATION;
const input = (coverage: ScoreInput["coverage"], requirements: ScoreInput["requirements"]): ScoreInput => ({
  requirements,
  coverage,
  sections: [],
});

describe("meterView", () => {
  it("carries score, tier, next move and always the caveat", () => {
    const score = scoreResume(
      input(
        [
          { requirementId: "m0", verdict: "covered", reason: "", evidenceBulletIds: [] },
          { requirementId: "m1", verdict: "gap", reason: "", evidenceBulletIds: [] },
        ],
        [
          { id: "m0", text: "ml", kind: "must_have" },
          { id: "m1", text: "shipped LLM products", kind: "must_have" },
        ],
      ),
    );
    const v = meterView(score);
    expect(v.score).toBe(50);
    expect(v.tierId).toBe("thin");
    expect(v.nextMove?.text).toBe("shipped LLM products");
    expect(v.nextMove?.deltaPoints).toBe(50);
    expect(v.caveat).toBe(READINESS_CAVEAT);
    expect(v.track.markerPct).toBe(50);
  });

  it("draws only the reachable bands, not the evidence-gated ceiling", () => {
    const score = scoreResume(input([{ requirementId: "m0", verdict: "covered", reason: "", evidenceBulletIds: [] }], [{ id: "m0", text: "x", kind: "must_have" }]));
    const v = meterView(score);
    expect(v.track.tiers.map((t) => t.id)).toEqual(["thin", "solid", "strong"]);
    expect(v.track.tiers.find((t) => t.id === "fully")).toBeUndefined();
    // fully-covered → fully tier badge, but track still shows bands only
    expect(v.tierId).toBe("fully");
    expect(v.nextMove).toBeNull();
  });

  it("passes the lift through when provided", () => {
    const score = scoreResume(input([{ requirementId: "m0", verdict: "covered", reason: "", evidenceBulletIds: [] }], [{ id: "m0", text: "x", kind: "must_have" }]));
    expect(meterView(score, { lift: { masterScore: 77, tailoredScore: 91, delta: 14 } }).lift).toBe(14);
    expect(meterView(score).lift).toBeNull();
  });
});

describe("liftLabel — honest sign, silent on zero", () => {
  it("formats positive, negative, and null", () => {
    expect(liftLabel(14)).toBe("+14 from your master");
    expect(liftLabel(-3)).toBe("−3 from your master");
    expect(liftLabel(0)).toBeNull();
    expect(liftLabel(null)).toBeNull();
  });
});

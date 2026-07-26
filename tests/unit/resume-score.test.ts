import { describe, it, expect } from "vitest";
import {
  scoreResume,
  scoreLift,
  tierFor,
  computeNextMove,
  type Requirement,
  type RequirementCoverage,
  type ResumeSection,
  type ScoreInput,
} from "@/lib/resume/score";
import { DEFAULT_CALIBRATION, type ScoreCalibration } from "@/lib/resume/calibration";

/**
 * P1 — the pure résumé coverage roll-up. Importance-weighted 0–100, honest
 * tiers (Fully evidenced gated on real completeness, never partial credit),
 * per-section strength, the highest-leverage next move, and the master→tailored
 * lift. Coverage/craft only — never an outcome prediction.
 */

const cal = DEFAULT_CALIBRATION;

const must = (id: string): Requirement => ({ id, text: `must ${id}`, kind: "must_have" });
const nice = (id: string): Requirement => ({ id, text: `nice ${id}`, kind: "nice_to_have" });

const cov = (
  requirementId: string,
  verdict: RequirementCoverage["verdict"],
  evidenceBulletIds: string[] = [],
): RequirementCoverage => ({ requirementId, verdict, reason: `${verdict} because`, evidenceBulletIds });

const input = (
  requirements: Requirement[],
  coverage: RequirementCoverage[],
  sections: ResumeSection[] = [],
): ScoreInput => ({ requirements, coverage, sections });

describe("scoreResume — importance-weighted coverage", () => {
  it("all requirements covered → 100 and fully evidenced", () => {
    const r = scoreResume(
      input([must("a"), must("b"), nice("c")], [cov("a", "covered"), cov("b", "covered"), cov("c", "covered")]),
    );
    expect(r.score).toBe(100);
    expect(r.allCovered).toBe(true);
    expect(r.tier.id).toBe("fully");
    expect(r.counts).toEqual({ covered: 3, partial: 0, gap: 0, total: 3 });
    expect(r.nextMove).toBeNull();
  });

  it("all gaps → 0 and thin", () => {
    const r = scoreResume(input([must("a"), nice("b")], [cov("a", "gap"), cov("b", "gap")]));
    expect(r.score).toBe(0);
    expect(r.tier.id).toBe("thin");
    expect(r.allCovered).toBe(false);
  });

  it("weights must-haves far above nice-to-haves (3:1)", () => {
    // 1 must covered, 1 nice gap: 3/(3+1) = 75
    const mustCovered = scoreResume(input([must("a"), nice("b")], [cov("a", "covered"), cov("b", "gap")]));
    // 1 must gap, 1 nice covered: 1/(3+1) = 25
    const niceCovered = scoreResume(input([must("a"), nice("b")], [cov("a", "gap"), cov("b", "covered")]));
    expect(mustCovered.score).toBe(75);
    expect(niceCovered.score).toBe(25);
  });

  it("partial earns half credit", () => {
    const r = scoreResume(input([must("a"), must("b")], [cov("a", "covered"), cov("b", "partial")]));
    // (1 + 0.5)/2 = 75
    expect(r.score).toBe(75);
    expect(r.counts.partial).toBe(1);
  });

  it("a missing verdict is treated as a gap (fail-closed)", () => {
    const r = scoreResume(input([must("a"), must("b")], [cov("a", "covered")]));
    expect(r.counts.gap).toBe(1);
    expect(r.score).toBe(50);
  });

  it("no requirements → 0, no tier crash, no next move", () => {
    const r = scoreResume(input([], []));
    expect(r.score).toBe(0);
    expect(r.allCovered).toBe(false);
    expect(r.nextMove).toBeNull();
  });

  it("stamps the calibration version for provenance", () => {
    const r = scoreResume(input([must("a")], [cov("a", "covered")]));
    expect(r.calibrationVersion).toBe(cal.version);
  });
});

describe("the truth-gate cap — Fully evidenced is never bought with partials", () => {
  it("all-partial can reach a numeric ceiling but never the fully tier", () => {
    // 4 musts all partial → 0.5 → score 50; but crucially, not 'fully'.
    const r = scoreResume(
      input([must("a"), must("b"), must("c"), must("d")], [
        cov("a", "partial"),
        cov("b", "partial"),
        cov("c", "partial"),
        cov("d", "partial"),
      ]),
    );
    expect(r.allCovered).toBe(false);
    expect(r.tier.id).not.toBe("fully");
  });

  it("tierFor: a 100 score with allCovered=false does not promote to fully", () => {
    expect(tierFor(100, false, cal).id).toBe("strong");
    expect(tierFor(100, true, cal).id).toBe("fully");
  });

  it("tierFor: honest thresholds thin/solid/strong", () => {
    expect(tierFor(0, false, cal).id).toBe("thin");
    expect(tierFor(54, false, cal).id).toBe("thin");
    expect(tierFor(55, false, cal).id).toBe("solid");
    expect(tierFor(77, false, cal).id).toBe("solid");
    expect(tierFor(78, false, cal).id).toBe("strong");
  });
});

describe("computeNextMove — the single highest-leverage move", () => {
  it("prefers the heaviest uncovered requirement (a gap must-have)", () => {
    const reqs = [must("a"), nice("b")];
    const byReq = new Map([
      ["a", cov("a", "gap")],
      ["b", cov("b", "gap")],
    ]);
    const move = computeNextMove(reqs, byReq, cal);
    expect(move?.requirementId).toBe("a");
    expect(move?.kind).toBe("must_have");
    // lifting a must from gap→covered: 3/(3+1)=75 points
    expect(move?.deltaPoints).toBe(75);
  });

  it("a partial has less headroom than a same-weight gap", () => {
    const reqs = [must("a"), must("b")];
    const byReq = new Map([
      ["a", cov("a", "partial")],
      ["b", cov("b", "gap")],
    ]);
    const move = computeNextMove(reqs, byReq, cal);
    expect(move?.requirementId).toBe("b"); // gap gains more than partial
  });

  it("null when everything is covered", () => {
    const reqs = [must("a")];
    const byReq = new Map([["a", cov("a", "covered")]]);
    expect(computeNextMove(reqs, byReq, cal)).toBeNull();
  });
});

describe("scoreSections — strength scoped to the requirements a section evidences", () => {
  const requirements = [must("a"), must("b"), nice("c")];
  const sections: ResumeSection[] = [
    { id: "exp1", title: "Acme", bulletIds: ["l1", "l2"] },
    { id: "exp2", title: "Globex", bulletIds: ["l3"] },
    { id: "exp3", title: "Init", bulletIds: ["l9"] }, // evidences nothing
  ];
  const coverage = [
    cov("a", "covered", ["l1"]), // evidenced by exp1
    cov("b", "partial", ["l3"]), // evidenced by exp2
    cov("c", "gap", []),
  ];

  it("scopes each section to only its evidenced requirements", () => {
    const r = scoreResume(input(requirements, coverage, sections));
    const exp1 = r.sections.find((s) => s.id === "exp1")!;
    const exp2 = r.sections.find((s) => s.id === "exp2")!;
    expect(exp1.requirementIds).toEqual(["a"]);
    expect(exp1.score).toBe(100); // its one requirement is covered
    expect(exp1.tier?.id).toBe("fully");
    expect(exp2.requirementIds).toEqual(["b"]);
    expect(exp2.score).toBe(50); // its one requirement is partial
    expect(exp2.tier?.id).not.toBe("fully");
  });

  it("a section that evidences nothing scores null, not zero", () => {
    const r = scoreResume(input(requirements, coverage, sections));
    const exp3 = r.sections.find((s) => s.id === "exp3")!;
    expect(exp3.score).toBeNull();
    expect(exp3.tier).toBeNull();
    expect(exp3.requirementIds).toEqual([]);
  });
});

describe("scoreLift — +N from your master, honest and comparable", () => {
  it("computes tailored − master from full scores", () => {
    const master = scoreResume(input([must("a"), must("b")], [cov("a", "covered"), cov("b", "gap")]));
    const tailored = scoreResume(input([must("a"), must("b")], [cov("a", "covered"), cov("b", "covered")]));
    const lift = scoreLift(master, tailored);
    expect(lift.masterScore).toBe(50);
    expect(lift.tailoredScore).toBe(100);
    expect(lift.delta).toBe(50);
  });

  it("accepts bare numbers and can be negative (never dishonest)", () => {
    expect(scoreLift(80, 72).delta).toBe(-8);
  });
});

describe("config-driven calibration — P4 can retune without touching the math", () => {
  it("a custom calibration changes weights and cutoffs", () => {
    const flat: ScoreCalibration = {
      ...cal,
      version: "test-flat",
      weights: { must_have: 1, nice_to_have: 1 },
      tiers: [
        { id: "low", label: "Low", min: 0 },
        { id: "high", label: "High", min: 50 },
        { id: "fully", label: "Fully evidenced", min: 100 },
      ],
    };
    const r = scoreResume(input([must("a"), nice("b")], [cov("a", "covered"), cov("b", "gap")]), flat);
    expect(r.score).toBe(50); // equal weights now
    expect(r.tier.id).toBe("high");
    expect(r.calibrationVersion).toBe("test-flat");
  });
});

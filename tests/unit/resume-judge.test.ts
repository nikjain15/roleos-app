import { describe, it, expect } from "vitest";
import {
  cosineSim,
  rankEvidence,
  requirementsFromRole,
  bulletsFromArtifact,
  bulletsFromProfile,
  type ResumeBullet,
} from "@/lib/resume/judge";
import type { Requirement } from "@/lib/resume/score";

/**
 * P1 — the coverage judge's PURE seams: cosine, evidence ranking, and the
 * grounded structuring of a role's requirements + a tailored artifact's bullets.
 * The model call itself (network) is exercised live, not here.
 */

describe("cosineSim", () => {
  it("identical direction → 1, orthogonal → 0", () => {
    expect(cosineSim([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSim([1, 0], [0, 5])).toBeCloseTo(0);
  });
  it("a zero vector → 0 (no NaN)", () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
});

describe("rankEvidence — top-k candidate bullets per requirement", () => {
  const reqs: Requirement[] = [
    { id: "m0", text: "ml", kind: "must_have" },
    { id: "m1", text: "pm", kind: "must_have" },
  ];
  const reqVectors = [
    [1, 0], // m0 points along axis 0
    [0, 1], // m1 points along axis 1
  ];
  const bullets: ResumeBullet[] = [
    { id: "b0", text: "shipped ml" },
    { id: "b1", text: "led pm" },
    { id: "b2", text: "unrelated" },
  ];
  const bulletVectors = [
    [1, 0.1], // ~axis 0
    [0.1, 1], // ~axis 1
    [-1, -1], // opposite
  ];

  it("surfaces the aligned bullet first and drops the anti-aligned", () => {
    const ranked = rankEvidence(reqs, reqVectors, bullets, bulletVectors, 4, 0.2);
    expect(ranked.get("m0")![0].bulletId).toBe("b0");
    expect(ranked.get("m1")![0].bulletId).toBe("b1");
    // b2 (negative cosine) is below minSim for both
    expect(ranked.get("m0")!.some((c) => c.bulletId === "b2")).toBe(false);
  });

  it("respects topK", () => {
    const ranked = rankEvidence(reqs, reqVectors, bullets, bulletVectors, 1, 0);
    expect(ranked.get("m0")!.length).toBe(1);
  });
});

describe("requirementsFromRole — weighted, id'd, from jsonb arrays", () => {
  it("splits must_haves and nice_to_haves with stable ids and kinds", () => {
    const reqs = requirementsFromRole({
      must_haves: ["5+ yrs ML", "shipped LLM products"],
      nice_to_haves: ["startup experience"],
    });
    expect(reqs).toEqual([
      { id: "m0", text: "5+ yrs ML", kind: "must_have" },
      { id: "m1", text: "shipped LLM products", kind: "must_have" },
      { id: "n0", text: "startup experience", kind: "nice_to_have" },
    ]);
  });
  it("tolerates missing/garbage arrays", () => {
    expect(requirementsFromRole({})).toEqual([]);
    expect(requirementsFromRole({ must_haves: "nope", nice_to_haves: [1, "", "  ", "ok"] })).toEqual([
      { id: "n0", text: "ok", kind: "nice_to_have" },
    ]);
  });
});

describe("bulletsFromArtifact — via the structured doc model", () => {
  it("extracts bullet text with doc-model ids (legacy flat → one section)", () => {
    const bullets = bulletsFromArtifact({
      summary: "s",
      bullets: [
        { text: "Led ML platform", rationale: "r", evidence: "e" },
        { text: "  ", rationale: "r" }, // blank → dropped
        { text: "Grew revenue 3x" },
      ],
    });
    expect(bullets).toEqual([
      { id: "exp0-l0", text: "Led ML platform" },
      { id: "exp0-l2", text: "Grew revenue 3x" }, // blank at l1 dropped; ids keep source position
    ]);
  });
  it("reads the new experience-section shape too", () => {
    const bullets = bulletsFromArtifact({
      experience: [{ company: "Acme", title: "PM", lines: [{ text: "Built ML platform" }] }],
    });
    expect(bullets).toEqual([{ id: "exp0-l0", text: "Built ML platform" }]);
  });
  it("tolerates a malformed artifact", () => {
    expect(bulletsFromArtifact(null)).toEqual([]);
    expect(bulletsFromArtifact({ bullets: "nope" })).toEqual([]);
  });
});

describe("bulletsFromProfile — the master baseline for +N", () => {
  it("flattens every experience highlight into stable bullets", () => {
    const bullets = bulletsFromProfile({
      version: 1,
      experience: [
        { title: "PM", company: "Acme", highlights: ["Led ML platform", "Grew rev 3x"], source: "resume", confidence: 0.8 },
        { title: "Eng", company: "Globex", highlights: ["Shipped LLM assistant"], source: "resume", confidence: 0.8 },
      ],
    });
    expect(bullets).toEqual([
      { id: "mp0", text: "Led ML platform" },
      { id: "mp1", text: "Grew rev 3x" },
      { id: "mp2", text: "Shipped LLM assistant" },
    ]);
  });
  it("tolerates a missing/garbage profile → no bullets, no crash (no lift)", () => {
    expect(bulletsFromProfile(null)).toEqual([]);
    expect(bulletsFromProfile({ experience: "nope" })).toEqual([]);
    expect(bulletsFromProfile(undefined)).toEqual([]);
  });
});

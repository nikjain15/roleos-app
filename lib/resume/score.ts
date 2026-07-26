/**
 * The résumé coverage scorer — PURE roll-up (docs/specs/resume-editor-v2.md).
 *
 * Score = how well a tailored résumé's real evidence covers a role's stated
 * requirements. NOT a prediction of interview odds — we never score outcomes we
 * don't control. This module is the deterministic core: given per-requirement
 * coverage verdicts (covered / partial / gap) already decided by the judge
 * adapter (./judge), it computes the importance-weighted 0–100, the honest tier,
 * per-section strength, the tailoring lift (`+N from your master`), and the one
 * highest-leverage next move. No I/O, no model calls — every branch is unit
 * tested against fixtures. The LLM + `bge` retrieval live at the edges (./judge).
 *
 * Guardrail: the judge's verdicts are truth-gated, so this math can never rise
 * by inventing evidence — a gap persists until real evidence covers it.
 */

import {
  DEFAULT_CALIBRATION,
  type ScoreCalibration,
  type Tier,
} from "./calibration";

// ── inputs (the judge's grounded output) ────────────────────────────────────

export type RequirementKind = "must_have" | "nice_to_have";
export type CoverageVerdict = "covered" | "partial" | "gap";

/** One stated role requirement, structured from the posting. */
export interface Requirement {
  id: string;
  text: string;
  kind: RequirementKind;
}

/** The judge's grounded verdict for one requirement. */
export interface RequirementCoverage {
  requirementId: string;
  verdict: CoverageVerdict;
  /** One-line reason (surfaced in the UI). */
  reason: string;
  /** Résumé bullet ids that evidence this requirement (drives section strength). */
  evidenceBulletIds: string[];
}

/** An experience block: its id/title + the bullet ids it contains. */
export interface ResumeSection {
  id: string;
  title: string;
  bulletIds: string[];
}

export interface ScoreInput {
  requirements: Requirement[];
  /** One verdict per requirement. A requirement with no entry is treated as a gap. */
  coverage: RequirementCoverage[];
  sections: ResumeSection[];
}

// ── outputs ─────────────────────────────────────────────────────────────────

export interface CoverageCounts {
  covered: number;
  partial: number;
  gap: number;
  total: number;
}

export interface SectionScore {
  id: string;
  title: string;
  /** null when the section evidences no stated requirement (nothing to score). */
  score: number | null;
  tier: Tier | null;
  /** Requirements this section provides evidence for. */
  requirementIds: string[];
}

export interface NextMove {
  requirementId: string;
  text: string;
  kind: RequirementKind;
  fromVerdict: CoverageVerdict;
  /** Points the score would gain if this requirement became fully covered. */
  deltaPoints: number;
}

export interface ResumeScore {
  /** Importance-weighted coverage, 0–100. */
  score: number;
  tier: Tier;
  /** True only when every requirement is covered (zero gaps AND zero partials). */
  allCovered: boolean;
  counts: CoverageCounts;
  sections: SectionScore[];
  /** The single highest-leverage uncovered requirement, or null if fully evidenced. */
  nextMove: NextMove | null;
  calibrationVersion: string;
}

/** `+N from your master`: the tailoring lift, real and comparable. */
export interface ScoreLift {
  masterScore: number;
  tailoredScore: number;
  /** tailored − master, may be negative (honest). */
  delta: number;
}

// ── core math ───────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function verdictOf(
  requirementId: string,
  byReq: Map<string, RequirementCoverage>,
): CoverageVerdict {
  return byReq.get(requirementId)?.verdict ?? "gap";
}

/**
 * Importance-weighted coverage over a set of requirements → 0–100.
 * Σ(weight · credit) / Σ(weight) · 100. Empty set → 0 (nothing evidenced).
 */
function weightedCoverage(
  requirements: Requirement[],
  byReq: Map<string, RequirementCoverage>,
  cal: ScoreCalibration,
): number {
  let num = 0;
  let den = 0;
  for (const req of requirements) {
    const w = cal.weights[req.kind];
    den += w;
    num += w * cal.credit[verdictOf(req.id, byReq)];
  }
  if (den === 0) return 0;
  return Math.round(clamp((num / den) * 100, 0, 100));
}

function countVerdicts(
  requirements: Requirement[],
  byReq: Map<string, RequirementCoverage>,
): CoverageCounts {
  const counts: CoverageCounts = { covered: 0, partial: 0, gap: 0, total: requirements.length };
  for (const req of requirements) counts[verdictOf(req.id, byReq)]++;
  return counts;
}

/**
 * The honest tier for a score. "Fully evidenced" (the configured ceiling) is
 * gated on `allCovered` — never reachable by partial credit alone — so we never
 * claim complete evidence a résumé doesn't have. Otherwise: the highest
 * non-ceiling tier whose `min` the score clears.
 */
export function tierFor(score: number, allCovered: boolean, cal: ScoreCalibration): Tier {
  const ceiling = cal.tiers.find((t) => t.id === cal.fullyEvidencedTierId);
  if (allCovered && ceiling) return ceiling;

  let picked: Tier = cal.tiers[0];
  for (const t of cal.tiers) {
    if (t.id === cal.fullyEvidencedTierId) continue; // ceiling is evidence-gated only
    if (score >= t.min) picked = t;
  }
  return picked;
}

/**
 * The single next move: of the uncovered requirements (gaps first, then
 * partials), the one whose full coverage would raise the score most — with the
 * exact point delta. Ties broken by weight then order. Null when fully covered.
 */
export function computeNextMove(
  requirements: Requirement[],
  byReq: Map<string, RequirementCoverage>,
  cal: ScoreCalibration,
): NextMove | null {
  const totalWeight = requirements.reduce((s, r) => s + cal.weights[r.kind], 0);
  if (totalWeight === 0) return null;

  let best: NextMove | null = null;
  for (const req of requirements) {
    const verdict = verdictOf(req.id, byReq);
    if (verdict === "covered") continue;
    const w = cal.weights[req.kind];
    // Gain from lifting this requirement to fully covered.
    const gain = (w * (cal.credit.covered - cal.credit[verdict])) / totalWeight;
    const deltaPoints = Math.round(gain * 100);
    if (deltaPoints <= 0) continue;
    if (!best || deltaPoints > best.deltaPoints) {
      best = { requirementId: req.id, text: req.text, kind: req.kind, fromVerdict: verdict, deltaPoints };
    }
  }
  return best;
}

/**
 * Per-section strength: the same coverage math scoped to the requirements this
 * section provides evidence for (via the judge's `evidenceBulletIds`). A section
 * that evidences nothing scores null (honest — not a zero to be ashamed of).
 */
function scoreSections(
  input: ScoreInput,
  byReq: Map<string, RequirementCoverage>,
  cal: ScoreCalibration,
): SectionScore[] {
  const reqById = new Map(input.requirements.map((r) => [r.id, r]));

  return input.sections.map((section) => {
    const bulletSet = new Set(section.bulletIds);
    const reqIds = input.coverage
      .filter((c) => c.evidenceBulletIds.some((b) => bulletSet.has(b)))
      .map((c) => c.requirementId);
    const uniqueReqIds = [...new Set(reqIds)];
    const sectionReqs = uniqueReqIds
      .map((id) => reqById.get(id))
      .filter((r): r is Requirement => !!r);

    if (sectionReqs.length === 0) {
      return { id: section.id, title: section.title, score: null, tier: null, requirementIds: [] };
    }
    const score = weightedCoverage(sectionReqs, byReq, cal);
    const allCovered = sectionReqs.every((r) => verdictOf(r.id, byReq) === "covered");
    return {
      id: section.id,
      title: section.title,
      score,
      tier: tierFor(score, allCovered, cal),
      requirementIds: uniqueReqIds,
    };
  });
}

/**
 * Score one tailored résumé against one role. Pure: the caller supplies grounded
 * coverage verdicts (from ./judge). Deterministic and fully unit tested.
 */
export function scoreResume(
  input: ScoreInput,
  cal: ScoreCalibration = DEFAULT_CALIBRATION,
): ResumeScore {
  const byReq = new Map(input.coverage.map((c) => [c.requirementId, c]));
  const counts = countVerdicts(input.requirements, byReq);
  const score = weightedCoverage(input.requirements, byReq, cal);
  const allCovered = input.requirements.length > 0 && counts.covered === counts.total;

  return {
    score,
    tier: tierFor(score, allCovered, cal),
    allCovered,
    counts,
    sections: scoreSections(input, byReq, cal),
    nextMove: computeNextMove(input.requirements, byReq, cal),
    calibrationVersion: cal.version,
  };
}

/**
 * `+N from your master`: the same scorer run on the master profile's coverage vs
 * the tailored résumé's coverage → the real, comparable tailoring lift. Accepts
 * either a full ResumeScore or a bare 0–100 for each side.
 */
export function scoreLift(
  master: ResumeScore | number,
  tailored: ResumeScore | number,
): ScoreLift {
  const masterScore = typeof master === "number" ? master : master.score;
  const tailoredScore = typeof tailored === "number" ? tailored : tailored.score;
  return { masterScore, tailoredScore, delta: tailoredScore - masterScore };
}

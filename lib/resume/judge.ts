/**
 * The coverage-judge adapter (docs/specs/resume-editor-v2.md §"Pipeline").
 *
 * The grounded edge around the pure scorer (./score): it turns a real role +
 * tailored résumé into the per-requirement coverage verdicts the roll-up
 * consumes. Two stages, both grounded, no invention:
 *   1. Evidence retrieval — embed each requirement + each bullet (Cloudflare
 *      `bge`, one shared vector space); cosine surfaces candidate evidence.
 *   2. Coverage judge — ONE metered model call (reasoning tier) decides
 *      covered / partial / gap per requirement from that candidate evidence,
 *      with a one-line reason. Fails closed (gap) on anything unparseable.
 *
 * "Meter every model call": the judge routes through `callModel` and returns its
 * `AgentRunRecord`s so the caller persists them via `logAgentRuns`. The retrieval
 * cosine is pure and unit-tested; the model call is not (network).
 *
 * Guardrail: the judge only credits evidence actually present in the (already
 * truth-gated) bullets — it can never lift a gap by inventing proof.
 */

import { callModel, type AgentRunRecord } from "@/agent/registry";
import { embeddings } from "@/lib/embeddings";
import { parseModelJson } from "@/lib/json";
import { scoreResume, type ResumeScore } from "./score";
import type {
  Requirement,
  RequirementCoverage,
  RequirementKind,
  ResumeSection,
  CoverageVerdict,
} from "./score";
import { DEFAULT_CALIBRATION, type ScoreCalibration } from "./calibration";

// ── grounded inputs, structured from what already exists ─────────────────────

/** A résumé bullet to judge evidence against. */
export interface ResumeBullet {
  id: string;
  text: string;
}

/** A role row (the columns we read). must_haves/nice_to_haves are jsonb arrays. */
export interface RoleRow {
  must_haves?: unknown;
  nice_to_haves?: unknown;
}

const asStrings = (v: unknown, max = 40): string[] =>
  Array.isArray(v)
    ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, max)
    : [];

/** Structure a role's stated requirements into weighted, id'd Requirements. */
export function requirementsFromRole(role: RoleRow): Requirement[] {
  const mk = (text: string, kind: RequirementKind, i: number): Requirement => ({
    id: `${kind === "must_have" ? "m" : "n"}${i}`,
    text,
    kind,
  });
  return [
    ...asStrings(role.must_haves).map((t, i) => mk(t, "must_have", i)),
    ...asStrings(role.nice_to_haves).map((t, i) => mk(t, "nice_to_have", i)),
  ];
}

/** The tailored artifact's bullet list (draft_resume `content.bullets`). */
export function bulletsFromArtifact(content: unknown): ResumeBullet[] {
  const o = (content && typeof content === "object" ? content : {}) as Record<string, unknown>;
  const raw = Array.isArray(o.bullets) ? o.bullets : [];
  return raw
    .map((b, i): ResumeBullet | null => {
      const text = typeof b === "object" && b ? (b as Record<string, unknown>).text : b;
      return typeof text === "string" && text.trim() ? { id: `b${i}`, text: text.trim() } : null;
    })
    .filter((b): b is ResumeBullet => b !== null);
}

// ── stage 1: evidence retrieval (bge cosine) ─────────────────────────────────

/** Cosine similarity of two equal-length vectors. Pure. 0 for a zero vector. */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface EvidenceCandidate {
  bulletId: string;
  sim: number;
}

/**
 * Rank bullets by cosine to each requirement, pure. Given the requirement
 * vectors and bullet vectors (index-aligned to the passed arrays), returns the
 * top-k candidate bullets per requirement, best first, above `minSim`.
 */
export function rankEvidence(
  requirements: Requirement[],
  reqVectors: number[][],
  bullets: ResumeBullet[],
  bulletVectors: number[][],
  topK = 4,
  minSim = 0.2,
): Map<string, EvidenceCandidate[]> {
  const out = new Map<string, EvidenceCandidate[]>();
  requirements.forEach((req, ri) => {
    const ranked = bullets
      .map((b, bi) => ({ bulletId: b.id, sim: cosineSim(reqVectors[ri] ?? [], bulletVectors[bi] ?? []) }))
      .filter((c) => c.sim >= minSim)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, topK);
    out.set(req.id, ranked);
  });
  return out;
}

/** Embed requirements + bullets in the shared space and rank candidates. */
export async function retrieveEvidence(
  requirements: Requirement[],
  bullets: ResumeBullet[],
  opts: { topK?: number; minSim?: number } = {},
): Promise<Map<string, EvidenceCandidate[]>> {
  if (requirements.length === 0 || bullets.length === 0) {
    return new Map(requirements.map((r) => [r.id, []]));
  }
  const provider = embeddings();
  // One shared provider/space for query + corpus (else cosine is meaningless).
  const [reqVectors, bulletVectors] = await Promise.all([
    provider.embed(requirements.map((r) => r.text)),
    provider.embed(bullets.map((b) => b.text)),
  ]);
  return rankEvidence(requirements, reqVectors, bullets, bulletVectors, opts.topK, opts.minSim);
}

// ── stage 2: the coverage judge (one metered model call) ─────────────────────

const VERDICTS: ReadonlySet<string> = new Set(["covered", "partial", "gap"]);

function judgePrompt(
  requirements: Requirement[],
  bulletsById: Map<string, ResumeBullet>,
  candidates: Map<string, EvidenceCandidate[]>,
): { system: string; user: string } {
  const items = requirements.map((req) => ({
    requirementId: req.id,
    requirement: req.text,
    kind: req.kind,
    candidate_evidence: (candidates.get(req.id) ?? []).map((c) => ({
      bulletId: c.bulletId,
      text: bulletsById.get(c.bulletId)?.text ?? "",
    })),
  }));
  return {
    system: [
      "You are RO's coverage judge, grading how well a tailored résumé EVIDENCES a role's stated requirements.",
      "You judge coverage ONLY. You do not rewrite, and you never invent evidence.",
      "For each requirement decide, from the candidate evidence bullets provided (and only those):",
      "'covered' = a bullet clearly and specifically evidences the requirement;",
      "'partial' = adjacent/related proof that falls short of the full requirement;",
      "'gap' = no listed bullet genuinely evidences it. When unsure, choose the LOWER verdict — honesty over generosity.",
      "evidenceBulletIds MUST be a subset of that requirement's candidate bulletIds, and empty for a gap.",
      "Return STRICT minified JSON only:",
      '{"coverage":[{"requirementId":string,"verdict":"covered|partial|gap","reason":"one honest line","evidenceBulletIds":[string]}]}',
    ].join(" "),
    user: `REQUIREMENTS + CANDIDATE EVIDENCE:\n${JSON.stringify(items)}\n\nJudge coverage. JSON only.`,
  };
}

interface JudgeResult {
  coverage: RequirementCoverage[];
  runs: AgentRunRecord[];
}

/**
 * The metered coverage judge. One `callModel("reason")` grades every requirement
 * at once. Fails closed: any requirement the model omits or returns malformed is
 * a gap. Returns `runs` for the caller to persist (the metering invariant).
 */
export async function judgeCoverage(
  requirements: Requirement[],
  bullets: ResumeBullet[],
  candidates: Map<string, EvidenceCandidate[]>,
): Promise<JudgeResult> {
  if (requirements.length === 0) return { coverage: [], runs: [] };

  const bulletsById = new Map(bullets.map((b) => [b.id, b]));
  const { system, user } = judgePrompt(requirements, bulletsById, candidates);
  const { text, run } = await callModel("reason", { system, prompt: user }, { skill: "judge_coverage" });

  const parsed = parseModelJson<{ coverage?: unknown[] }>(text);
  const rows = Array.isArray(parsed?.coverage) ? parsed!.coverage : [];
  const byId = new Map<string, RequirementCoverage>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const requirementId = typeof o.requirementId === "string" ? o.requirementId : "";
    const verdict = typeof o.verdict === "string" && VERDICTS.has(o.verdict) ? (o.verdict as CoverageVerdict) : "gap";
    const allowed = new Set((candidates.get(requirementId) ?? []).map((c) => c.bulletId));
    const evidenceBulletIds =
      verdict === "gap"
        ? []
        : (Array.isArray(o.evidenceBulletIds) ? o.evidenceBulletIds : [])
            .filter((b): b is string => typeof b === "string" && allowed.has(b));
    // Model claimed coverage with no admissible evidence → fail closed to gap.
    const finalVerdict: CoverageVerdict = verdict !== "gap" && evidenceBulletIds.length === 0 ? "gap" : verdict;
    byId.set(requirementId, {
      requirementId,
      verdict: finalVerdict,
      reason: typeof o.reason === "string" ? o.reason.slice(0, 300) : "",
      evidenceBulletIds,
    });
  }

  // Every requirement gets a verdict; anything the model dropped is a gap.
  const coverage = requirements.map(
    (req) => byId.get(req.id) ?? { requirementId: req.id, verdict: "gap" as const, reason: "No evidence found.", evidenceBulletIds: [] },
  );
  return { coverage, runs: [run] };
}

// ── orchestration: role + tailored résumé → score ────────────────────────────

export interface TailoredScoreResult {
  score: ResumeScore;
  coverage: RequirementCoverage[];
  runs: AgentRunRecord[];
}

/**
 * Full grounded pipeline for one tailored résumé: structure requirements →
 * retrieve evidence (bge) → judge coverage (metered) → pure roll-up. The caller
 * owns persistence and MUST `logAgentRuns(userId, result.runs, {skill:"judge_coverage"})`.
 * `sections` is optional — the roll-up handles a flat bullet list (no per-section
 * strength until the doc is structured in P2).
 */
export async function scoreTailoredResume(
  role: RoleRow,
  bullets: ResumeBullet[],
  opts: { sections?: ResumeSection[]; calibration?: ScoreCalibration; topK?: number; minSim?: number } = {},
): Promise<TailoredScoreResult> {
  const cal = opts.calibration ?? DEFAULT_CALIBRATION;
  const requirements = requirementsFromRole(role);
  const candidates = await retrieveEvidence(requirements, bullets, { topK: opts.topK, minSim: opts.minSim });
  const { coverage, runs } = await judgeCoverage(requirements, bullets, candidates);
  const score = scoreResume({ requirements, coverage, sections: opts.sections ?? [] }, cal);
  return { score, coverage, runs };
}

import { callModel } from "@/agent/registry";
import type { AgentRunRecord } from "@/agent/registry";
import { parseModelJson } from "@/lib/json";

/**
 * THE QUALITY GATE (architecture.md §4.4) — nothing reaches the user raw.
 * Cheap deterministic checks first, the expensive smart check last:
 *
 *   1. shape check        — output is structurally right
 *   2. guardrails         — no-send · truth-gate · privacy · voice blocklist
 *   3. critic (LLM-judge) — separate Claude call vs the ro-voice ship-checklist
 *   4. revise loop        — auto-fix once, re-judge; still failing → surfaced honestly
 *   5. tag                — attach confidence + provenance
 *
 * Every verdict is returned so the caller can write it to agent_runs.
 */

export interface GateInput {
  skillId: string;
  output: string;
  /** Claims must trace to this (master_profile slice) — truth-gate. */
  groundTruth?: string;
  expects?: (text: string) => boolean;
  /** JSON output — judge it, but never run the prose revise (it corrupts JSON). */
  structured?: boolean;
  /**
   * Skip the LLM voice-critic + revise (shape + deterministic guardrails only).
   * For deliberate ROLE-PLAY personas (the mock interviewer) whose voice is NOT
   * RO's own companion voice — still guardrailed, just not voice-judged.
   */
  skipCritic?: boolean;
  /**
   * Run the truth gate but SKIP the voice critic (default: run it). For structured
   * artifacts that aren't RO's conversational voice — a tailored RÉSUMÉ is the
   * candidate's bullets, not RO talking, so the ro-voice ship-checklist misapplies
   * and just adds latency + spurious flags. The truth gate still governs.
   */
  voiceCritic?: boolean;
}

export type GateStatus = "passed" | "needs_your_eyes";

export interface GateVerdict {
  status: GateStatus;
  finalOutput: string;
  shapeOk: boolean;
  guardrails: GuardrailResult;
  critic: CriticVerdict | null;
  truth: TruthVerdict | null;
  revised: boolean;
  confidence: Confidence;
  /** The 0..1 score the confidence band was derived from. Deterministic. */
  confidenceScore: number;
  runs: AgentRunRecord[]; // critic + truth + revise model calls, for agent_runs
}

/** The truth-gate verdict (gate 1 résumé, etc.): claims traceable to ground truth? */
export interface TruthVerdict {
  ok: boolean;
  /** Each unsupported claim or overstatement, in plain language. */
  violations: string[];
}

interface GuardrailResult {
  ok: boolean;
  failures: string[];
}

interface CriticVerdict {
  pass: boolean;
  reasons: string[];
}

/** Confidence bands, weakest to strongest. "unknown" = we cannot vouch. */
export type Confidence = "stated" | "strong" | "weak" | "unknown";

/**
 * The signals the gate already has, distilled into what the confidence model
 * reads. All deterministic and network-free.
 */
export interface ConfidenceSignals {
  /** Output is structurally the right shape. */
  shapeOk: boolean;
  /** Deterministic guardrails (no-send · voice blocklist · privacy) all passed. */
  guardrailsOk: boolean;
  /** The voice critic passed. null when the critic was skipped (role-play). */
  criticPass: boolean | null;
  /** Residual caveats the critic noted even on a pass. */
  criticReasons: number;
  /** The truth gate passed. null when no ground truth was supplied. */
  truthOk: boolean | null;
  /** Unsupported/overstated claims the truth gate still noted. */
  truthViolations: number;
  /** A prose or truth-driven revise had to run to reach this output. */
  revised: boolean;
  /** Length of the ground-truth slice the claims were checked against. null = none supplied. */
  groundingChars: number | null;
}

/**
 * Below this, a skill that IS grounded (ground truth supplied) is running on a
 * thin slice: enough to pass the truth gate, not enough to be confident. This
 * is the "critic passes but grounding is thin" path into `weak`.
 */
export const GROUNDING_MIN_CHARS = 400;

/**
 * Deterministically derive a confidence band (via a 0..1 score) from the signals
 * the gate already computed. This replaces the old hard-coded "strong on pass /
 * unknown on shape-fail" placeholder with a real, documented signal.
 *
 * Bands:
 *  • unknown: a hard gate failed (shape, guardrails, critic, truth). We cannot
 *    vouch for the output. This is the fail-closed floor.
 *  • weak: the hard gates passed, but a soft concern remains: the first draft
 *    needed a revise, the grounding slice was thin, or the judges noted residual
 *    caveats. Reachable and meaningful: the caller escalates on it.
 *  • strong: a clean pass on every signal.
 */
export function computeConfidence(s: ConfidenceSignals): { band: Confidence; score: number } {
  // Fail-closed floor: if any hard gate did not pass, we cannot vouch.
  if (!s.shapeOk || !s.guardrailsOk) return { band: "unknown", score: 0 };
  if (s.criticPass === false) return { band: "unknown", score: 0 };
  if (s.truthOk === false) return { band: "unknown", score: 0 };

  // On a passing path, grade the strength of that pass.
  let score = 1;
  if (s.revised) score -= 0.3; // the first draft needed fixing
  if (s.groundingChars !== null && s.groundingChars < GROUNDING_MIN_CHARS) score -= 0.35; // thin grounding
  if (s.criticReasons > 0) score -= 0.15; // critic passed with caveats
  if (s.truthViolations > 0) score -= 0.15; // truth passed with noted caveats
  if (score < 0) score = 0;

  const band: Confidence = score >= 0.8 ? "strong" : score >= 0.45 ? "weak" : "unknown";
  return { band, score };
}

// ro-voice.html voice blocklist — banned phrasings (hype, toxic positivity,
// guilt, manufactured urgency). Deterministic, fast, before the LLM judge.
const VOICE_BLOCKLIST: RegExp[] = [
  /everything happens for a reason/i,
  /\bact now\b/i,
  /don'?t fall behind/i,
  /you haven'?t logged in/i,
  /🎉|🚀|🔥|😱/u, // emoji-spam / hype markers
  /\bgame[- ]?changer\b/i,
  /#1\b|\bworld'?s best\b/i,
];

// Crude outbound-marker scan on the OUTPUT text — defense in depth on top of
// the structural no-send invariant. RO never claims to have sent anything.
const NO_SEND_MARKERS: RegExp[] = [
  /\bi (?:have )?(?:sent|emailed|submitted|dispatched) (?:it|your|the)\b/i,
];

/** Exported for unit testing — the deterministic, network-free guardrail pass. */
export function inspectGuardrails(output: string): GuardrailResult {
  return runGuardrails({ skillId: "", output });
}

function runGuardrails(input: GateInput): GuardrailResult {
  const failures: string[] = [];
  for (const re of NO_SEND_MARKERS) {
    if (re.test(input.output)) failures.push("no-send: output claims an outbound action");
  }
  for (const re of VOICE_BLOCKLIST) {
    if (re.test(input.output)) failures.push(`voice-blocklist: ${re}`);
  }
  // truth-gate + privacy are deepened per-gate in Phase 3 (they need the real
  // master_profile + a PII scan). Stubbed honestly here, not faked as passing.
  return { ok: failures.length === 0, failures };
}

const SHIP_CHECKLIST = `You are RO's quality critic. Grade the draft against RO's ship-checklist (ro-voice.html):
- Leads with the point / the call?
- Honest and calibrated to the evidence (no false certainty)?
- Warm, not cold — ends on a way forward?
- No hype, no guilt, no manufactured urgency?
- Sounds like a companion in your corner — not a chatbot or a servant?
- If hard news: acknowledge → truth → forward?
- Would RO say this even if it meant less time-in-app (wellbeing > engagement)?
Reply with a single line: PASS  or  REVISE: <comma-separated reasons>.`;

async function critique(
  skillId: string,
  output: string,
): Promise<{ verdict: CriticVerdict; run: AgentRunRecord }> {
  const { text, run } = await callModel(
    "critic",
    { system: SHIP_CHECKLIST, prompt: output },
    { skill: `critic:${skillId}` },
  );
  const pass = /^\s*PASS\b/i.test(text);
  const reasons = pass
    ? []
    : text.replace(/^\s*REVISE:?/i, "").split(",").map((s) => s.trim()).filter(Boolean);
  return { verdict: { pass, reasons }, run };
}

const TRUTH_SYSTEM = `You are RO's truth gate for a tailored résumé. You are given the candidate's MASTER PROFILE (the only source of truth) and a DRAFT. Find any claim in the draft that is NOT supported by the master profile, or that OVERSTATES it — invented titles, employers, metrics, skills, scope, or seniority. Reframing real experience is fine; inventing or inflating is not.
Reply with STRICT JSON only: {"ok": boolean, "violations": ["plain-language description of each unsupported or overstated claim"]}. If everything traces to the profile, ok=true and violations=[].`;

/** The truth gate (gate 1): does every claim trace to the master profile? */
async function truthGate(
  skillId: string,
  output: string,
  groundTruth: string,
): Promise<{ verdict: TruthVerdict; run: AgentRunRecord }> {
  const { text, run } = await callModel(
    "critic",
    { system: TRUTH_SYSTEM, prompt: `MASTER PROFILE:\n${groundTruth}\n\nDRAFT:\n${output}` },
    { skill: `truth:${skillId}` },
  );
  const o = parseModelJson<{ ok?: boolean; violations?: unknown }>(text);
  if (o && typeof o.ok === "boolean") {
    return { verdict: { ok: o.ok, violations: Array.isArray(o.violations) ? o.violations : [] }, run };
  }
  // Fail closed: if the truth judge is genuinely unparseable, don't claim a pass.
  return { verdict: { ok: false, violations: ["truth gate could not verify the draft"] }, run };
}

export async function runQualityGate(input: GateInput): Promise<GateVerdict> {
  const runs: AgentRunRecord[] = [];

  // 1 · shape
  const shapeOk = input.expects ? input.expects(input.output) : input.output.trim().length > 0;

  // 2 · guardrails
  const guardrails = runGuardrails(input);

  const grounding = typeof input.groundTruth === "string" ? input.groundTruth.trim().length : null;

  if (input.expects && !shapeOk) {
    const c = computeConfidence({
      shapeOk,
      guardrailsOk: guardrails.ok,
      criticPass: null,
      criticReasons: 0,
      truthOk: null,
      truthViolations: 0,
      revised: false,
      groundingChars: grounding,
    });
    return {
      status: "needs_your_eyes",
      finalOutput: input.output,
      shapeOk,
      guardrails,
      critic: null,
      truth: null,
      revised: false,
      confidence: c.band,
      confidenceScore: c.score,
      runs,
    };
  }

  // Role-play personas (mock interviewer): shape + guardrails only, no voice critic.
  if (input.skipCritic) {
    const c = computeConfidence({
      shapeOk,
      guardrailsOk: guardrails.ok,
      criticPass: null, // no voice critic on a deliberate role-play persona
      criticReasons: 0,
      truthOk: null,
      truthViolations: 0,
      revised: false,
      groundingChars: grounding,
    });
    return {
      status: guardrails.ok ? "passed" : "needs_your_eyes",
      finalOutput: input.output,
      shapeOk,
      guardrails,
      critic: null,
      truth: null,
      revised: false,
      confidence: c.band,
      confidenceScore: c.score,
      runs,
    };
  }

  // 3 · critic (+ truth gate when ground truth is supplied — gate 1 résumé).
  // The voice critic is skippable for non-conversational structured output (a
  // tailored résumé); the truth gate always runs when ground truth is supplied.
  const runVoice = input.voiceCritic !== false;
  const [first, truthRes] = await Promise.all([
    runVoice ? critique(input.skillId, input.output) : Promise.resolve(null),
    input.groundTruth
      ? truthGate(input.skillId, input.output, input.groundTruth)
      : Promise.resolve(null),
  ]);
  // No voice critic → treat as a voice pass; the truth gate is the governing check.
  let verdict: CriticVerdict = first ? first.verdict : { pass: true, reasons: [] };
  if (first) runs.push(first.run);
  const truth = truthRes?.verdict ?? null;
  if (truthRes) runs.push(truthRes.run);

  let finalOutput = input.output;
  let revised = false;
  let truthFinal = truth;

  // 4 · structured (JSON) output: skip the PROSE revise (it corrupts JSON), but
  // run a TRUTH-DRIVEN revise — re-ground the flagged lines to the master profile
  // and re-check. Keeps the honesty guarantee while sparing the user manual fixes.
  if (input.structured) {
    if (truth && !truth.ok && input.groundTruth) {
      const fix = await callModel(
        "draft",
        {
          system:
            "Revise this JSON résumé to FIX the flagged claims: change each flagged line so it traces strictly to the master profile, or drop it. Do NOT invent anything new. Return the SAME JSON shape, JSON only.",
          prompt: `FLAGGED (must fix):\n${truth.violations.join("\n")}\n\nMASTER PROFILE (only source of truth):\n${input.groundTruth}\n\nDRAFT JSON:\n${input.output}`,
        },
        { skill: `truth-revise:${input.skillId}` },
      );
      runs.push(fix.run);
      // Only accept the revision if it's still shape-valid.
      if (!input.expects || input.expects(fix.text)) {
        finalOutput = fix.text;
        revised = true;
        const re = await truthGate(input.skillId, finalOutput, input.groundTruth);
        runs.push(re.run);
        truthFinal = re.verdict;
      }
    }
    const truthOk2 = truthFinal ? truthFinal.ok : true;
    const c = computeConfidence({
      shapeOk,
      guardrailsOk: guardrails.ok,
      criticPass: runVoice ? verdict.pass : null,
      criticReasons: runVoice ? verdict.reasons.length : 0,
      truthOk: truthFinal ? truthFinal.ok : null,
      truthViolations: truthFinal ? truthFinal.violations.length : 0,
      revised,
      groundingChars: grounding,
    });
    return {
      status: verdict.pass && guardrails.ok && truthOk2 ? "passed" : "needs_your_eyes",
      finalOutput,
      shapeOk,
      guardrails,
      critic: runVoice ? verdict : null,
      truth: truthFinal,
      revised,
      confidence: c.band,
      confidenceScore: c.score,
      runs,
    };
  }

  const truthOk = truth ? truth.ok : true;
  if (!verdict.pass || !guardrails.ok) {
    const reviseReasons = [...verdict.reasons, ...guardrails.failures].join("; ");
    const fix = await callModel(
      "draft",
      {
        system:
          "Revise the draft to fix the listed issues. Keep RO's voice (candid, warm, leads with the call). Return only the revised draft.",
        prompt: `Issues: ${reviseReasons}\n\n---\n${input.output}`,
      },
      { skill: `revise:${input.skillId}` },
    );
    runs.push(fix.run);
    finalOutput = fix.text;
    revised = true;

    const second = await critique(input.skillId, finalOutput);
    runs.push(second.run);
    verdict = second.verdict;
  }

  const guardrails2 = runGuardrails({ ...input, output: finalOutput });
  const passed = verdict.pass && guardrails2.ok && truthOk;

  const c = computeConfidence({
    shapeOk,
    guardrailsOk: guardrails2.ok,
    criticPass: runVoice ? verdict.pass : null,
    criticReasons: runVoice ? verdict.reasons.length : 0,
    truthOk: truth ? truth.ok : null,
    truthViolations: truth ? truth.violations.length : 0,
    revised,
    groundingChars: grounding,
  });

  return {
    status: passed ? "passed" : "needs_your_eyes",
    finalOutput,
    shapeOk,
    guardrails: guardrails2,
    critic: runVoice ? verdict : null,
    truth,
    revised,
    confidence: c.band,
    confidenceScore: c.score,
    runs,
  };
}

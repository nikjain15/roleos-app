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
  confidence: "stated" | "strong" | "weak" | "unknown";
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

  if (input.expects && !shapeOk) {
    return {
      status: "needs_your_eyes",
      finalOutput: input.output,
      shapeOk,
      guardrails,
      critic: null,
      truth: null,
      revised: false,
      confidence: "unknown",
      runs,
    };
  }

  // 3 · critic (+ truth gate when ground truth is supplied — gate 1 résumé).
  const [first, truthRes] = await Promise.all([
    critique(input.skillId, input.output),
    input.groundTruth
      ? truthGate(input.skillId, input.output, input.groundTruth)
      : Promise.resolve(null),
  ]);
  let verdict = first.verdict;
  runs.push(first.run);
  const truth = truthRes?.verdict ?? null;
  if (truthRes) runs.push(truthRes.run);

  let finalOutput = input.output;
  let revised = false;

  // A truth violation is never auto-fixable here — it means a claim isn't
  // supported. Surface honestly; never ship.
  const truthOk = truth ? truth.ok : true;

  // 4 · revise once, then re-judge — PROSE ONLY. For structured (JSON) output,
  // the prose revise would corrupt the structure, so we skip it: the output
  // already passed shape + guardrails, and the critic verdict is still logged.
  if (input.structured) {
    return {
      status: verdict.pass && guardrails.ok && truthOk ? "passed" : "needs_your_eyes",
      finalOutput,
      shapeOk,
      guardrails,
      critic: verdict,
      truth,
      revised: false,
      confidence: "strong",
      runs,
    };
  }

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

  return {
    status: passed ? "passed" : "needs_your_eyes",
    finalOutput,
    shapeOk,
    guardrails: guardrails2,
    critic: verdict,
    truth,
    revised,
    confidence: "strong",
    runs,
  };
}

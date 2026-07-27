import { callModel, jobSpec, type AgentRunRecord, type AnthropicJob } from "@/agent/registry";
import { inferViaConduit } from "@/agent/conduit";
import { runQualityGate, type GateVerdict } from "@/agent/quality-gate";
import { liveTools } from "@/agent/tools";
import {
  classifyDifficulty,
  cheaperTier,
  strongerTier,
  TIER_LADDER,
  type Difficulty,
} from "@/agent/routing";
import type { Skill, SkillInput } from "./skill";

/**
 * The stateless skill runner. Loads a skill, runs the Anthropic call, then sends
 * the output through the quality gate before it can reach the user. This is the
 * ONE path skill output takes. No send capability.
 *
 * The primary generation call now flows through `@conduit/client` in EMBEDDED
 * mode (agent/conduit.ts): the transport is Conduit's unified `infer`, the core
 * is RoleOS's own metered `callModel`, so cost accounting and behaviour are
 * unchanged. The secondary shape-repair reformat stays a direct `callModel`.
 *
 * The build-studio Durable Object (gate 3) calls this same runner + gate: one
 * quality standard, two ways of running.
 */
export interface SkillRunResult {
  skillId: string;
  verdict: GateVerdict;
  /** How the answer was routed: the difficulty signal + the tier path taken. */
  routing: RoutingTrace;
}

export interface RoutingTrace {
  /** The runtime difficulty signal derived from the prompt. */
  difficulty: Difficulty;
  /** The ordered tiers actually run, one per attempt (registry job names). */
  tiers: AnthropicJob[];
  /** True when the answer moved off the statically assigned tier (up or down). */
  rerouted: boolean;
  /** The confidence band of the final (accepted) verdict. */
  confidence: GateVerdict["confidence"];
}

/**
 * Dynamic routing applies to the PRIMARY ANSWER PATH only: full-gate skills on
 * an answer tier (draft/reason). Off-ladder tiers (code, quick_tag) and
 * shape-only skills keep their static routing untouched, so the build canvas
 * and the classifiers behave exactly as before.
 */
function dynamicEligible(skill: Skill): boolean {
  return skill.gate === "full" && (skill.model === "draft" || skill.model === "reason");
}

// Hard bound on escalation: at most walk the ladder from bottom to top. Even a
// gate that keeps failing can never loop more than this many times.
const MAX_ESCALATIONS = TIER_LADDER.length;

export async function runSkill(skill: Skill, input: SkillInput): Promise<SkillRunResult> {
  const { system, user } = skill.prompt(input);

  // Hand the model the skill's DECLARED tools that are actually DB-backed
  // (liveTools filters out phase-2 placeholders). When a skill declares live
  // tools, callModel runs a real tool loop — args validated, results fed back —
  // instead of relying on prompt-stuffed grounding. Read/derive-only: the
  // no-send invariant still holds (no send tool exists to hand over).
  const skillTools = liveTools(skill.tools);
  const toolOpts =
    skillTools.length > 0
      ? { tools: skillTools, toolContext: { userId: input.userId } }
      : {};

  // ── Dynamic difficulty-based routing ────────────────────────────────────
  // Start on the statically assigned tier, but let a runtime signal move it:
  //   DOWN: a trivially simple prose input takes the cheap fast path;
  //   UP:   a failing gate verdict (needs_your_eyes) OR a pass that the gate
  //         graded WEAK confidence escalates to a stronger tier and re-runs,
  //         bounded so it can never loop forever.
  // The gate stays the safety net: a cheap fast path that underperforms is
  // caught and escalated straight back up, so quality never regresses.
  const eligible = dynamicEligible(skill);
  const difficulty = classifyDifficulty(user);
  const baseMaxTokens = jobSpec(skill.model).params?.max_tokens;

  let tier: AnthropicJob = skill.model;
  if (eligible && !skill.structured && difficulty === "trivial") {
    const cheap = cheaperTier(skill.model);
    if (cheap) tier = cheap; // route DOWN for the trivial fast path
  }

  const tiers: AnthropicJob[] = [];
  const allRuns: AgentRunRecord[] = [];
  let verdict!: GateVerdict;

  for (let attempt = 0; ; attempt++) {
    tiers.push(tier);
    const pinned = tier !== skill.model;

    const { text, run, toolCalls } = await inferViaConduit(
      skill.model,
      { system, prompt: user },
      { skill: skill.id, ...toolOpts },
      pinned ? { job: tier, maxTokens: baseMaxTokens } : undefined,
    );
    void toolCalls; // captured on the ModelResult for callers that log the trace

    // Shape-repair: a structured skill whose FIRST output doesn't parse into the
    // expected shape (Sonnet occasionally wraps JSON in prose / code fences / adds
    // trailing commas) would otherwise be thrown away by the gate, leaving the user
    // with an empty artifact. One reformat pass (reshape only, invent nothing)
    // recovers the content before it reaches the gate.
    let output = text;
    const repairRuns: AgentRunRecord[] = [];
    if (skill.structured && skill.expects && !skill.expects(output)) {
      const repair = await callModel(
        "draft",
        {
          system:
            "The text below was meant to be a SINGLE strict JSON object. Return ONLY valid minified JSON: fix syntax (unquoted keys, trailing commas, code fences, surrounding prose) and keep the SAME keys and values. Change nothing, invent nothing. If no JSON object is recoverable, return {}.",
          prompt: output,
        },
        { skill: `${skill.id}:shape-repair` },
      );
      repairRuns.push(repair.run);
      if (skill.expects(repair.text)) output = repair.text;
    }

    verdict = await runQualityGate({
      skillId: skill.id,
      output,
      expects: skill.expects,
      structured: skill.structured,
      skipCritic: skill.gate === "shape_only",
      voiceCritic: skill.voiceCritic,
      groundTruth: typeof input.data.groundTruth === "string" ? input.data.groundTruth : undefined,
    });

    // Meter EVERY hop: this attempt's generation (+ repair) and its gate calls.
    allRuns.push(run, ...repairRuns, ...verdict.runs);

    // Escalate when the gate is not satisfied OR it passed but only at WEAK
    // confidence, and a stronger tier exists, within the hard attempt bound.
    // `needs_your_eyes` covers a failed critic and a failed (fail-closed) truth
    // gate; the WEAK check is the graded signal: a thin-grounding / borderline
    // pass that a stronger tier may firm up. Bounded by MAX_ESCALATIONS and the
    // ladder top (strongerTier returns null), so it can never loop.
    // Don't escalate when the TRUTH gate is the blocker: a résumé's ceiling is the
    // candidate's real experience, so a stronger model can't clear a genuine
    // overstatement — the truth-revise loop already tried at this tier. Escalating
    // there just doubles latency for an honestly-bounded draft. Escalate only for
    // failures a stronger tier can plausibly fix (voice/thin-grounding weakness).
    const truthBlocked = !!(verdict.truth && !verdict.truth.ok);
    const needsStronger =
      (verdict.status === "needs_your_eyes" || verdict.confidence === "weak") && !truthBlocked;
    const next =
      eligible && needsStronger && attempt < MAX_ESCALATIONS ? strongerTier(tier) : null;
    if (!next) break;
    tier = next; // route UP
  }

  // The metered runs now span every tier attempted, oldest first.
  verdict.runs = allRuns;

  return {
    skillId: skill.id,
    verdict,
    routing: {
      difficulty,
      tiers,
      rerouted: tiers.length > 1 || tiers[0] !== skill.model,
      confidence: verdict.confidence,
    },
  };
}

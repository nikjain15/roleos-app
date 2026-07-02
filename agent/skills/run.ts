import { callModel } from "@/agent/registry";
import { runQualityGate, type GateVerdict } from "@/agent/quality-gate";
import type { Skill, SkillInput } from "./skill";

/**
 * The stateless skill runner. Loads a skill, runs the Anthropic call (raw SDK,
 * via callModel), then sends the output through the quality gate before it can
 * reach the user. This is the ONE path skill output takes. No send capability.
 *
 * The build-studio Durable Object (gate 3) calls this same runner + gate — one
 * quality standard, two ways of running.
 */
export interface SkillRunResult {
  skillId: string;
  verdict: GateVerdict;
}

export async function runSkill(skill: Skill, input: SkillInput): Promise<SkillRunResult> {
  const { system, user } = skill.prompt(input);

  const { text, run } = await callModel(
    skill.model,
    { system, prompt: user },
    { skill: skill.id },
  );

  // Shape-repair: a structured skill whose FIRST output doesn't parse into the
  // expected shape (Sonnet occasionally wraps JSON in prose / code fences / adds
  // trailing commas) would otherwise be thrown away by the gate, leaving the user
  // with an empty artifact. One reformat pass — reshape only, invent nothing —
  // recovers the content before it reaches the gate.
  let output = text;
  const repairRuns: (typeof run)[] = [];
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

  const verdict = await runQualityGate({
    skillId: skill.id,
    output,
    expects: skill.expects,
    structured: skill.structured,
    skipCritic: skill.gate === "shape_only",
    groundTruth: typeof input.data.groundTruth === "string" ? input.data.groundTruth : undefined,
  });

  // Include the skill's own generation call (+ any repair) in the metered runs.
  verdict.runs.unshift(run, ...repairRuns);

  return { skillId: skill.id, verdict };
}

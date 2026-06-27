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

  const { text } = await callModel(
    skill.model,
    { system, prompt: user },
    { skill: skill.id },
  );

  const verdict = await runQualityGate({
    skillId: skill.id,
    output: text,
    expects: skill.expects,
    groundTruth: typeof input.data.groundTruth === "string" ? input.data.groundTruth : undefined,
  });

  return { skillId: skill.id, verdict };
}

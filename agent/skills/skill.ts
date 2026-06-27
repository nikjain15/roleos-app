import type { AnthropicJob } from "@/agent/registry";
import type { ToolName } from "@/agent/tools";

/**
 * A skill = the unit of "an agent" (architecture.md §4.0). One small declarative
 * file: which model job, which prompt, which tools, which gate. Adding/changing
 * an agent is a one-file change. The runner (./run.ts) executes it through the
 * raw Anthropic SDK and the quality gate — no framework, no Durable Object.
 */
export interface Skill {
  id: string;
  /** Names a registry JOB (reason/draft/quick_tag), not a hard-coded model. */
  model: AnthropicJob;
  /** The tools this skill may use. NEVER a send tool — none exists. */
  tools: ToolName[];
  /** Grounded prompt builder — operates over the user's real data. */
  prompt: (ctx: SkillInput) => { system: string; user: string };
  /** 'full' = run the whole quality gate before the user sees output. */
  gate: "full" | "shape_only";
  /**
   * Output is structured JSON (not user-facing prose). The gate still judges it
   * (shape + guardrails + critic, all logged) but skips the prose auto-revise,
   * which would corrupt the JSON. Prose inside fields is still voice-judged.
   */
  structured?: boolean;
  /** Shape check: does the raw output look structurally right? */
  expects?: (text: string) => boolean;
}

export interface SkillInput {
  userId: string;
  /** Free-form per-skill payload (role id, draft to revise, etc.). */
  data: Record<string, unknown>;
}

export function skill(s: Skill): Skill {
  return s;
}

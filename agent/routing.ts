import { jobSpec, type AnthropicJob } from "@/agent/registry";
import type { ModelRef } from "@/lib/conduit/client";

/**
 * DYNAMIC difficulty-based routing for the primary answer path (architecture.md
 * §4.0). Static task->tier routing (registry.json) picks ONE model per task and
 * never moves. This module adds a runtime signal so a task type can route DOWN
 * (a cheap fast path for trivially simple inputs) or UP (escalate to a stronger
 * tier when the quality/truth gate fails or confidence is low).
 *
 * The escalation ladder is cheapest -> strongest. Each rung names a registry job
 * whose MODEL defines the tier, so the ladder stays config-driven:
 *   quick_tag = Haiku (cheap)  ->  draft = Sonnet  ->  reason = Opus (strong).
 *
 * Movement along the ladder is expressed as a Conduit `pinModel` (the seam the
 * embedded client already carries but RoleOS never set), so every re-route still
 * flows through the metered registry and is cost-recorded like any other hop.
 */

export type Difficulty = "trivial" | "normal" | "hard";

/** Cheapest -> strongest. The single source of truth for tier ordering. */
export const TIER_LADDER: readonly AnthropicJob[] = [
  "quick_tag",
  "draft",
  "reason",
] as const;

function ladderIndexOfModel(model: string): number {
  return TIER_LADDER.findIndex((job) => jobSpec(job).model === model);
}

/** The ladder rung a registry job sits on, by its model. -1 if off-ladder. */
export function tierOf(job: AnthropicJob): number {
  return ladderIndexOfModel(jobSpec(job).model);
}

/** The stronger rung above `job`, or null when already at the top. */
export function strongerTier(job: AnthropicJob): AnthropicJob | null {
  const i = tierOf(job);
  if (i < 0 || i >= TIER_LADDER.length - 1) return null;
  return TIER_LADDER[i + 1];
}

/** The cheaper rung below `job`, or null when already at the bottom. */
export function cheaperTier(job: AnthropicJob): AnthropicJob | null {
  const i = tierOf(job);
  if (i <= 0) return null;
  return TIER_LADDER[i - 1];
}

/** The registry ModelRef for a job: what we pin through the Conduit seam. */
export function pinModelFor(job: AnthropicJob): ModelRef {
  const spec = jobSpec(job);
  return { provider: spec.provider, model: spec.model };
}

/** Resolve a pinned ModelRef back to its ladder job (undefined if off-ladder). */
export function tierJobForModel(ref: ModelRef): AnthropicJob | undefined {
  const i = ladderIndexOfModel(ref.model);
  return i >= 0 ? TIER_LADDER[i] : undefined;
}

// Markers that a request is doing real reasoning work, not a lookup. Kept
// deterministic and network-free: this is a cheap pre-signal, and the quality
// gate is the authoritative UP signal (a failed/low-confidence verdict escalates
// regardless of what this classifier guessed).
const HARD_MARKERS: RegExp[] = [
  /\bnegotiat/i,
  /\bcompare\b/i,
  /\btrade-?offs?\b/i,
  /\bstrateg/i,
  /\bwhy\b/i,
  /```/,
];

/**
 * Classify a prompt's difficulty from its text alone. Purely heuristic and
 * deterministic. It seeds the STARTING tier (trivial inputs may take the cheap
 * fast path). It never relaxes the gate: hard/normal simply start at the task's
 * assigned tier and rely on gate-driven escalation from there.
 */
export function classifyDifficulty(text: string): Difficulty {
  const t = (text ?? "").trim();
  const len = t.length;
  const questions = (t.match(/\?/g) ?? []).length;
  const hardHits = HARD_MARKERS.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);

  if (len > 1500 || questions >= 3 || hardHits >= 2) return "hard";
  if (len <= 240 && questions <= 1 && hardHits === 0) return "trivial";
  return "normal";
}

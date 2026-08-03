/**
 * Stop conditions for the tool loop in `agent/registry.ts`: what ends a run
 * besides the model deciding it is done.
 *
 * WHY THIS FILE EXISTS. `callModel` had one bound, `MAX_TOOL_TURNS = 6`, and
 * two gaps behind it.
 *
 * The first is cost. The loop already accumulates `inTok`/`outTok` and already
 * knows the per-token price, so it can compute what a run has spent at any
 * point, and it never once looked at that number to decide whether to continue.
 * `checkCostBudget` exists but is a rolling-24h ALERT that explicitly never
 * throws: it notices yesterday's money after it is gone, and it cannot stop the
 * run in front of it. A six-turn loop on a long resume is not a fixed cost,
 * because every turn resends the whole transcript plus every tool result so
 * far, so the last turn is by far the most expensive one.
 *
 * The second is repetition. Nothing noticed a model calling the same tool with
 * the same arguments and getting the same answer back, turn after turn, until
 * the cap. Six wasted turns cost the same as six useful ones.
 *
 * There is a third problem that is not a bound at all, and it is the one a user
 * would actually have noticed. When the cap was reached, the loop returned the
 * text of a response whose `stop_reason` was `tool_use`. That response is the
 * model asking for another tool, so its text block is usually empty or a
 * half-sentence. The run therefore ended by handing back nothing, with no
 * indication that anything had been cut short: exactly the "dying silently"
 * that a step cap is supposed to prevent. Every bound here carries a `notice`
 * for that reason.
 *
 * Pure: no network, no clock, no DB. The loop passes in what it measured.
 */

/** Why the tool loop ended. `completed` is the only one that is not a bound. */
export type LoopStop = "completed" | "max_tool_turns" | "budget_exhausted" | "loop_detected";

/**
 * A ceiling for one `callModel` invocation, across every turn of its tool loop.
 *
 * Both fields optional and independent. Omitted entirely means the turn cap is
 * the only bound, which is what every caller had before, so nothing changed
 * under an existing skill.
 */
export interface RunBudget {
  /** Total input + output tokens across every turn of the loop. */
  maxTokens?: number;
  /** Total USD across every turn, priced by the job's own `cost_per_mtok`. */
  maxCostUsd?: number;
}

/**
 * Which ceiling the run has reached, or null if it is still inside.
 *
 * Checked after a turn's usage is added and before another turn is bought, so
 * the budget bounds what a run is allowed to have spent rather than predicting
 * what the next turn will cost. A run may finish one turn over the line; it may
 * not start another. The alternative is estimating the next turn in advance,
 * and an estimate is a guess: this repo does not swap a measured number for a
 * guessed one.
 */
export function budgetBreach(
  spend: { tokens: number; costUsd: number },
  budget: RunBudget | undefined,
): string | null {
  if (!budget) return null;
  if (budget.maxTokens !== undefined && spend.tokens >= budget.maxTokens) {
    return `token budget: ${spend.tokens} of ${budget.maxTokens} tokens used`;
  }
  if (budget.maxCostUsd !== undefined && spend.costUsd >= budget.maxCostUsd) {
    return `cost budget: $${spend.costUsd.toFixed(4)} of $${budget.maxCostUsd.toFixed(4)} used`;
  }
  return null;
}

/**
 * A stable key for "this loop has been here before".
 *
 * The state is the tool call TOGETHER WITH what it returned, not the call
 * alone, and that is the whole design. RoleOS's own tools make the reason
 * concrete: a model may legitimately call the same search twice as the
 * conversation moves on, and a tool that reads a row someone else is writing
 * can honestly return something new. Keying on the call alone would halt those.
 *
 * What cannot be productive is an identical call returning an identical result.
 * The next turn then sees content it has already seen and has no new
 * information to act on, so it proposes the same thing again until the cap.
 *
 * Joined with NUL, written as an escape rather than a literal byte so the file
 * stays plain text. A printable separator can occur inside the JSON either
 * side of it, which would let two different states collide on one key and halt
 * a run that was making progress.
 */
export function toolStateKey(name: string, input: unknown, resultContent: string): string {
  return `${name}\u0000${canonicalJson(input)}\u0000${resultContent}`;
}

/**
 * Order-insensitive JSON, so `{a:1,b:2}` and `{b:2,a:1}` are one state rather
 * than two. `JSON.stringify` preserves insertion order, and a model that emits
 * the same arguments with the keys in a different order would otherwise slip
 * past the check.
 */
function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return "[circular]";
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return Object.fromEntries(entries.map(([k, val]) => [k, walk(val)]));
  };
  try {
    return JSON.stringify(walk(value)) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * What the user sees when a bound trips.
 *
 * One function for all three, so a cut-short run always reads the same way and
 * the three paths cannot drift into three different tones. This is the part
 * that was missing entirely: a run that hit the cap used to return an empty
 * string and no explanation.
 */
export function stopNotice(stop: LoopStop, detail: string, turnsTaken: number): string {
  const far = `Here is how far I got: ${turnsTaken} tool turn${turnsTaken === 1 ? "" : "s"} completed, and the answer above is based on what they returned.`;
  switch (stop) {
    case "completed":
      return "";
    case "max_tool_turns":
      return `I stopped at the tool-step limit (${detail}) before finishing. ${far}`;
    case "budget_exhausted":
      return `I stopped because this run reached its ${detail}. ${far}`;
    case "loop_detected":
      return `I stopped because the run was repeating itself: ${detail}. Continuing would have returned the same thing until the step limit. ${far}`;
  }
}

/**
 * The text a cut-short run hands back.
 *
 * A response that stopped for `tool_use` carries little or no text, so
 * returning it alone is what made the old cap look like a silent failure.
 * Where there is partial text the notice is appended to it; where there is
 * none the notice IS the answer, because an explanation beats an empty string.
 */
export function textWithNotice(text: string, notice: string): string {
  if (!notice) return text;
  const trimmed = text.trim();
  return trimmed ? `${trimmed}\n\n${notice}` : notice;
}

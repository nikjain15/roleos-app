/**
 * The kill line. R1.
 *
 * `lib/cost-budget.ts` answers "is today's spend out of control". This answers a
 * different question: **"is this design too expensive to be worth continuing"**.
 * They are not the same, and the difference is not pedantic. A runaway loop for
 * one user is an incident, and the budget alert is the right tool. A cost per
 * candidate that is structurally double what it should be is not an incident, it
 * is the product being wrong, and no amount of alerting on a daily total will
 * ever say so.
 *
 * ## Why cost, of all things
 *
 * `docs/DECISION_LOG.md` §Kill criteria worked out that RoleOS cannot have a
 * meaningful kill criterion on anything user-facing, because it has no external
 * users, and that **cost per journey is the only candidate metric already
 * collected**. `agent/registry.ts` writes every model call to `agent_runs` with a
 * real cost and a `user_id`, so the number exists today with no new
 * instrumentation. That is why the line is here rather than on match quality,
 * which has a harness but no production series.
 *
 * This is a weaker criterion than a quality one would be, and it is a real one.
 * Recording that ordering honestly is better than waiting indefinitely for users.
 *
 * ## The line, pre-committed
 *
 *   Kill or narrow if the MEDIAN cost per journey exceeds $2.00 across a rolling
 *   30 days, over at least 10 journeys.
 *
 *   Consequence: narrow to one gate. Not "optimise the prompts", not "try
 *   harder". Stop running five gates per candidate and run the one that carries
 *   the most signal, or hand the corpus to something else.
 *
 * `docs/COST.md` models a typical journey at **$0.80** and bounds it at **$1.31**
 * with every call at its ceiling. $2.00 sits above the all-at-ceiling bound on
 * purpose: crossing it cannot be explained by heavy-but-legitimate usage, so it
 * means something structural (retry storms, tier drift, a gate that grew). A line
 * at $1.31 would fire on a legitimately expensive month and get rationalised away
 * the first time, which is how a kill criterion dies.
 *
 * ## Median, not mean
 *
 * The mean is what the bill is made of, and it is the wrong statistic here. One
 * pathological journey drags a mean over any threshold, and that case is already
 * covered by the daily budget alert. The median asks "is the TYPICAL candidate
 * too expensive", which is the question that decides whether the design works.
 * Both are reported; only the median is compared to the line.
 *
 * Pure: no Supabase, no network, no clock of its own. The caller supplies totals.
 */

/** Days of history the kill line is evaluated over. */
export const KILL_WINDOW_DAYS = 30;

/** Median USD per journey that, sustained across the window, kills the design. */
export const KILL_COST_PER_JOURNEY_USD = 2.0;

/** Journeys required in the window before a median means anything. */
export const KILL_MIN_JOURNEYS = 10;

/** One candidate's total model spend inside the window. */
export type JourneyCost = {
  /** `agent_runs.user_id`. Present so a crossed line can be traced to real rows. */
  userId: string;
  costUsd: number;
};

export type KillStatus = "not_enough_data" | "holding" | "crossed";

export type KillVerdict = {
  status: KillStatus;
  reason: string;
  /** The statistic the line is compared against, or null when unreadable. */
  medianUsd: number | null;
  /** Reported alongside, never compared: one runaway journey moves this and not the median. */
  meanUsd: number | null;
  journeys: number;
  /** What to do now. Never "keep improving it". */
  action: string;
};

/** Median of a numeric list. Even counts average the middle pair. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Evaluate the kill line against one window of journeys.
 *
 * The caller is responsible for the window: pass the journeys whose runs fall in
 * the last `KILL_WINDOW_DAYS`. That boundary lives with whoever queries
 * `agent_runs`, so this stays pure and testable.
 */
export function evaluateKillLine(journeys: JourneyCost[]): KillVerdict {
  const costs = journeys.map((j) => j.costUsd);
  const med = median(costs);
  const avg = mean(costs);

  if (journeys.length < KILL_MIN_JOURNEYS) {
    return {
      status: "not_enough_data",
      reason:
        `${journeys.length} journey(s) in the window, below the ${KILL_MIN_JOURNEYS} needed for a ` +
        "median to mean anything.",
      medianUsd: med,
      meanUsd: avg,
      journeys: journeys.length,
      action:
        "Keep running. The median is reported and not acted on, because a median over a handful " +
        "of journeys is not evidence.",
    };
  }

  if (med !== null && med > KILL_COST_PER_JOURNEY_USD) {
    return {
      status: "crossed",
      reason:
        `Median cost per journey $${med.toFixed(2)} over ${journeys.length} journeys exceeds the ` +
        `$${KILL_COST_PER_JOURNEY_USD.toFixed(2)} kill line, and sits above the $1.31 all-at-ceiling ` +
        "bound in docs/COST.md, so it is not explained by heavy legitimate usage.",
      medianUsd: med,
      meanUsd: avg,
      journeys: journeys.length,
      action:
        "Narrow to one gate: stop running five gates per candidate and keep the one carrying the " +
        "most signal, or hand the corpus to something else. Do not re-tune prompts and re-measure; " +
        "that is the branch this criterion exists to rule out.",
    };
  }

  return {
    status: "holding",
    reason:
      `Median cost per journey $${med?.toFixed(2)} over ${journeys.length} journeys, at or below ` +
      `the $${KILL_COST_PER_JOURNEY_USD.toFixed(2)} kill line.`,
    medianUsd: med,
    meanUsd: avg,
    journeys: journeys.length,
    action: "Continue. Re-check monthly.",
  };
}

/**
 * Roll raw `agent_runs` rows into per-journey totals.
 *
 * A journey is one candidate, so runs are grouped by `user_id`. Rows with no
 * user (`on delete set null`, or a system job) are dropped rather than pooled
 * into a phantom journey, because a pooled bucket would look like one enormously
 * expensive candidate and could cross the line on its own.
 */
export function toJourneys(
  rows: readonly { user_id: string | null; cost_usd: number | string | null }[],
): JourneyCost[] {
  const byUser = new Map<string, number>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const cost = Number(r.cost_usd) || 0;
    byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + cost);
  }
  return [...byUser].map(([userId, costUsd]) => ({ userId, costUsd }));
}

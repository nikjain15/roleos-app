/**
 * Tracker depth (slice W5) — pure helpers for the funnel of record. Derives the
 * next action per stage, and a per-stage SLA verdict from the append-only
 * stage_history. Dependency-free and unit-tested; shared by the PATCH route
 * (auto next_action) and the board UI (SLA chips + timeline). No model calls —
 * this is deterministic funnel hygiene, not advice.
 */

export interface NextAction {
  label: string;
  due?: string; // ISO date
}

export interface StageEntry {
  stage: string;
  at: string;
}

/** Days after entering a stage before it needs attention (the SLA). */
export const STAGE_SLA_DAYS: Record<string, number | null> = {
  saved: 7, // decide or drop — don't let saved rot
  drafting: 3, // finish the résumé
  ready: 2, // it's ready — send it
  applied: 7, // silence after a week → follow up
  screening: 5, // schedule/prep the screen
  interviewing: 7,
  onsite: 7,
  offer: 5, // respond while it's warm (but never rushed advice)
  rejected: null,
  withdrawn: null,
};

const DAY_MS = 86_400_000;

/** When the application entered its current stage (last history entry wins). */
export function enteredStageAt(history: StageEntry[] | null | undefined, fallback: string): string {
  if (!history || history.length === 0) return fallback;
  return history[history.length - 1].at ?? fallback;
}

export type SlaState = { state: "ok" | "due" | "overdue"; daysInStage: number; slaDays: number | null };

/** SLA verdict for the current stage. `now` injected for testability. */
export function slaState(stage: string, enteredAt: string, now: Date): SlaState {
  const slaDays = STAGE_SLA_DAYS[stage] ?? null;
  const entered = Date.parse(enteredAt);
  const daysInStage = Number.isFinite(entered) ? Math.max(0, Math.floor((now.getTime() - entered) / DAY_MS)) : 0;
  if (slaDays === null) return { state: "ok", daysInStage, slaDays };
  if (daysInStage > slaDays) return { state: "overdue", daysInStage, slaDays };
  if (daysInStage === slaDays) return { state: "due", daysInStage, slaDays };
  return { state: "ok", daysInStage, slaDays };
}

/**
 * Derive the next action for a stage (W5 automation). Honest and specific —
 * each label is a real next step, never busywork. `due` = entered + SLA.
 */
export function deriveNextAction(
  stage: string,
  ctx: { enteredAt: string; hasApprovedResume?: boolean },
): NextAction | null {
  const sla = STAGE_SLA_DAYS[stage];
  const due =
    sla !== null && sla !== undefined && Number.isFinite(Date.parse(ctx.enteredAt))
      ? new Date(Date.parse(ctx.enteredAt) + sla * DAY_MS).toISOString().slice(0, 10)
      : undefined;

  switch (stage) {
    case "saved":
      return { label: ctx.hasApprovedResume ? "You have an approved résumé — move to ready" : "Tailor a résumé for this role", due };
    case "drafting":
      return { label: "Finish the résumé and resolve any flags", due };
    case "ready":
      return { label: "Send it — open Apply and submit", due };
    case "applied":
      return { label: "No reply yet? Send a short follow-up", due };
    case "screening":
      return { label: "Prep for the screen — role must-haves + your stories", due };
    case "interviewing":
      return { label: "Prep the next round; send thanks after each", due };
    case "onsite":
      return { label: "Prep the loop — one story per must-have", due };
    case "offer":
      return { label: "Evaluate the offer calmly — comp, growth, life fit", due };
    case "rejected":
    case "withdrawn":
      return null;
    default:
      return null;
  }
}

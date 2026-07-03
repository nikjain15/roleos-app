import type { Plan } from "@/lib/plan/types";
import type { NotifCandidate } from "@/lib/notifications";

/**
 * Goal-anchored pace nudge (Slice 9, goal-engine.md §8). PROACTIVE — RO pushes you
 * toward YOUR deadline — but strictly inside the wellbeing rule: it fires ONLY when
 * you're genuinely off pace and there's a concrete lever, never for inactivity,
 * streaks, or manufactured urgency. When you're on track (or resting is fine), it
 * returns null — RO stays quiet. Pure + tested.
 *
 * The `candidate` feeds the notifications engine (`decideNotification`): a hard,
 * user-actionable deadline is the only thing that raises the volume, and even then
 * gently. On-track / no-deadline → no nudge, ever.
 */
export interface PaceNudge {
  title: string;
  body: string;
  candidate: NotifCandidate;
}

export function buildPaceNudge(plan: Plan, deadlineHard: boolean): PaceNudge | null {
  const v = plan.feasibility.verdict;
  // Never nudge when things are fine — wellbeing over engagement.
  if (v === "on_track" || v === "no_deadline") return null;

  const days = plan.daysLeft;
  const dayLabel = days !== null ? ` for your ${days}-day goal` : "";

  const title =
    v === "off_track"
      ? `One call could put your goal back in reach${dayLabel}`
      : `You're a bit behind pace${dayLabel} — here's the one thing`;

  // Body leads with the lever (already candid-not-cold, no guilt) then the why.
  const body = `${plan.feasibility.bestLever} ${plan.feasibility.message}`.trim();

  const candidate: NotifCandidate = {
    kind: "pace",
    userActionable: true,
    // Only a HARD deadline that's slipping raises the volume past the digest.
    timeSensitive: deadlineHard && v === "off_track",
  };

  return { title, body, candidate };
}

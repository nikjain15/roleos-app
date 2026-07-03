import type { Goal, Plan, Range, Rates, Phase, Verdict } from "./types";
import { computeRates } from "./rates";

/**
 * computePlan — turns "X in Y days" into a concrete backward funnel + weekly pace
 * + feasibility verdict (goal-engine.md §3, §7b). Pure: `today` and `liveSupply`
 * are passed in so it's deterministic and unit-tested. The caller supplies rates
 * (blended from the tracker) or we fall back to priors.
 *
 * Honesty is structural: counts are RANGES, the apply-by date front-loads sending
 * before the deadline (interview lead time), and if the required pace exceeds the
 * user's ceiling or the live role supply, the goal is flagged At/Off-track from day
 * 0 — with the single best lever. Never false precision, never silent.
 */
const LEAD_DAYS = 28; // ~3-week interview cycle + ~1 week offer/decision

export interface PlanContext {
  today: string; // ISO yyyy-mm-dd
  liveSupply: number; // matching roles available now (from matches)
  rates?: Rates;
}

export function computePlan(goal: Goal, ctx: PlanContext): Plan {
  const rates = ctx.rates ?? computeRates();
  const a2s = rates.apply_to_screen;
  const s2o = rates.screen_to_onsite;
  const o2off = rates.onsite_to_offer;

  // Backward funnel for ~1 offer, as ranges (worst rates ⇒ most needed).
  const onsites = rangeFrom(1 / o2off.mid, 1 / o2off.high, 1 / o2off.low);
  const screens = rangeFrom(
    1 / (o2off.mid * s2o.mid),
    1 / (o2off.high * s2o.high),
    1 / (o2off.low * s2o.low),
  );
  const applications = rangeFrom(
    1 / (o2off.mid * s2o.mid * a2s.mid),
    1 / (o2off.high * s2o.high * a2s.high),
    1 / (o2off.low * s2o.low * a2s.low),
  );

  const deadline = goal.deadline_date ?? null;
  const daysLeft = deadline ? daysBetween(ctx.today, deadline) : null;

  // No deadline → give the funnel but no pace/verdict.
  if (!deadline || daysLeft === null) {
    return {
      generatedFor: ctx.today,
      deadline: null,
      daysLeft: null,
      funnel: { applications, screens, onsites, offers: 1 },
      rates,
      applyByDate: null,
      weeksToApplyBy: null,
      weekly: { applications: 0, addRoles: 0, prepSessions: 0 },
      phases: [],
      feasibility: {
        verdict: "no_deadline",
        requiredAppsPerWeek: 0,
        ceilingAppsPerWeek: goal.intensity?.apps_per_week_ceiling ?? null,
        liveSupply: ctx.liveSupply,
        bestLever: "Set a target date so I can pace the hunt.",
        message: "Give me a deadline and I'll turn this into a week-by-week plan.",
      },
    };
  }

  const applyByDate = addDays(deadline, -LEAD_DAYS);
  const daysToApplyBy = daysBetween(ctx.today, applyByDate);
  const weeksToApplyBy = Math.max(0.5, daysToApplyBy / 7);

  const requiredAppsPerWeek = Math.ceil(applications.mid / weeksToApplyBy);
  const addRoles = Math.ceil(requiredAppsPerWeek * 1.3); // source more than you send (skips)
  const prepSessions = Math.min(3, Math.max(1, Math.round(onsites.mid / Math.max(1, weeksToApplyBy))));

  const ceiling = goal.intensity?.apps_per_week_ceiling ?? null;
  const { verdict, bestLever, message } = judge({
    deadline,
    daysToApplyBy,
    hard: goal.deadline_hard ?? false,
    requiredAppsPerWeek,
    ceiling,
    liveSupply: ctx.liveSupply,
    applications,
  });

  return {
    generatedFor: ctx.today,
    deadline,
    daysLeft,
    funnel: { applications, screens, onsites, offers: 1 },
    rates,
    applyByDate,
    weeksToApplyBy: round1(weeksToApplyBy),
    weekly: { applications: requiredAppsPerWeek, addRoles, prepSessions },
    phases: computePhases(daysLeft),
    feasibility: {
      verdict,
      requiredAppsPerWeek,
      ceilingAppsPerWeek: ceiling,
      liveSupply: ctx.liveSupply,
      bestLever,
      message,
    },
  };
}

function judge(a: {
  deadline: string;
  daysToApplyBy: number;
  hard: boolean;
  requiredAppsPerWeek: number;
  ceiling: number | null;
  liveSupply: number;
  applications: Range;
}): { verdict: Verdict; bestLever: string; message: string } {
  // Deadline too soon for even one interview cycle.
  if (a.daysToApplyBy <= 0) {
    return {
      verdict: "off_track",
      bestLever: "Extend the deadline — it's shorter than one interview cycle.",
      message:
        "This window is shorter than a realistic interview cycle (~4 weeks), so a hard offer by then is unlikely. Extending even 2–3 weeks changes the odds a lot — or we push hard and treat it as a stretch.",
    };
  }
  // Intensity ceiling can't meet required pace.
  if (a.ceiling && a.requiredAppsPerWeek > a.ceiling) {
    const gap = a.requiredAppsPerWeek / a.ceiling;
    const verdict: Verdict = gap > 1.5 ? "off_track" : "at_risk";
    return {
      verdict,
      bestLever: `Raise your weekly apps toward ${a.requiredAppsPerWeek}, or extend the deadline.`,
      message: `To stay on pace you'd send ~${a.requiredAppsPerWeek}/week, above your ${a.ceiling}/week ceiling. We can widen the target (more supply, higher hit-rate), lift the ceiling, or extend the date.`,
    };
  }
  // Not enough live matching roles to feed the funnel.
  if (a.liveSupply < a.applications.low) {
    return {
      verdict: "at_risk",
      bestLever: "Broaden the target so I can source more matching roles.",
      message: `I can see ~${a.liveSupply} matching roles, but the funnel needs ~${Math.round(
        a.applications.low,
      )}–${Math.round(a.applications.high)} applications. Broadening archetype/location/stage opens up supply.`,
    };
  }
  return {
    verdict: "on_track",
    bestLever: `Keep sending ~${a.requiredAppsPerWeek} targeted applications a week.`,
    message: `On pace: ~${a.requiredAppsPerWeek} targeted applications a week keeps a real shot at the deadline. I'll flag it the moment that slips.`,
  };
}

/** Ramp → Push → Convert → Close, proportional to the window (§7b·C). */
function computePhases(daysLeft: number): Phase[] {
  const d = Math.max(1, daysLeft);
  const ramp = Math.round(d * 0.15);
  const push = Math.round(d * 0.45);
  const convert = Math.round(d * 0.8);
  return [
    { key: "ramp", label: "Ramp — shortlist + first wave", startDay: 0, endDay: ramp },
    { key: "push", label: "Push — steady sending", startDay: ramp, endDay: push },
    { key: "convert", label: "Convert — interviews & onsites", startDay: push, endDay: convert },
    { key: "close", label: "Close — offers & negotiation", startDay: convert, endDay: d },
  ];
}

// ── range + date helpers (pure) ─────────────────────────────────────────────
function rangeFrom(mid: number, optimistic: number, pessimistic: number): Range {
  return {
    mid: Math.ceil(mid),
    low: Math.max(1, Math.floor(optimistic)),
    high: Math.ceil(pessimistic),
  };
}

/** Whole days from a→b (b−a), both ISO yyyy-mm-dd, UTC-anchored (tz-safe). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const ms = utc(iso) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

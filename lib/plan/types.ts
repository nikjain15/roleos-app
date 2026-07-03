/**
 * Shared shapes for the Plan & Pace engine (goal-engine.md §3–4). Pure data — no
 * DB or model types leak in here, so `lib/plan/*` stays unit-testable in isolation.
 */

/** The three funnel conversions we plan against. */
export type Stage = "apply_to_screen" | "screen_to_onsite" | "onsite_to_offer";

/** A conversion rate with honest uncertainty (empirical-Bayes posterior). */
export interface Rate {
  mid: number; // posterior mean
  low: number; // ~lower credible bound
  high: number; // ~upper credible bound
  n: number; // personal trials observed (0 → pure prior)
}

export type Rates = Record<Stage, Rate>;

/** Observed personal funnel counts (from the tracker; empty until Slice 3 data). */
export type Observed = Partial<Record<Stage, { conversions: number; trials: number }>>;

export interface Goal {
  target?: {
    archetype?: string;
    seniority?: string;
    comp_floor?: number;
    company_type?: string;
    location?: string;
    remote?: boolean;
    domains?: string[];
  };
  deadline_date?: string | null; // ISO yyyy-mm-dd
  deadline_hard?: boolean;
  intensity?: { hours_per_week?: number; apps_per_week_ceiling?: number };
}

export type Verdict = "on_track" | "at_risk" | "off_track" | "no_deadline";

export interface Range {
  low: number;
  mid: number;
  high: number;
}

export interface Phase {
  key: "ramp" | "push" | "convert" | "close";
  label: string;
  startDay: number; // days from today
  endDay: number;
}

export interface Plan {
  generatedFor: string; // today (ISO) the plan was computed against
  deadline: string | null;
  daysLeft: number | null;
  /** backward funnel: how many of each to land ~1 offer, as ranges */
  funnel: {
    applications: Range;
    screens: Range;
    onsites: Range;
    offers: number; // the goal: 1
  };
  rates: Rates;
  /** apply-by date: sending must front-load before this (deadline − lead time) */
  applyByDate: string | null;
  weeksToApplyBy: number | null;
  weekly: {
    applications: number; // targeted apps/week to stay on pace
    addRoles: number; // roles to add to the shortlist/week
    prepSessions: number;
  };
  phases: Phase[];
  feasibility: {
    verdict: Verdict;
    requiredAppsPerWeek: number;
    ceilingAppsPerWeek: number | null; // user intensity ceiling
    liveSupply: number; // matching roles available now
    bestLever: string; // the single most-improving move
    message: string; // candid, never cold
  };
}

export interface AgendaItem {
  id: string;
  title: string;
  detail?: string;
  priority: number; // higher = more impactful toward the goal
  href?: string;
}

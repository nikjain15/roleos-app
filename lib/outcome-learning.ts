import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Outcome-learning fit model (slice X4, docs/specs/x4-outcome-learning.md).
 * Reads the user's REAL funnel outcomes back into what RO shows next: a
 * bounded, explained, deterministic adjustment on displayed fit ("+4 · roles
 * like this converted 2/3 for you") and an honest calibration read-back for
 * X3's screen-likelihood scores. Counting with shrinkage, in the open — no
 * model calls, no migration, nothing stored; derived at render time from rows
 * the caller already owns (RLS).
 */

// ── outcomes from the funnel of record ─────────────────────────────────────

export interface StageEntry {
  stage: string;
  at: string;
}

export interface OutcomeApp {
  role_id: string | null;
  stage: string;
  stage_history: StageEntry[] | null;
}

/** Stages that mean the application beat the screen. */
const WIN_STAGES = new Set(["screening", "interviewing", "onsite", "offer"]);

export type Outcome = "win" | "loss" | null;

/**
 * Classify one application. Win = it EVER reached a screen or further. Loss =
 * a terminal verdict (rejected, or withdrawn after actually applying) without
 * ever reaching a screen. Everything else — drafts, ready, applied-and-waiting
 * — is null: silence is not a loss yet, and never counts against the user.
 */
export function outcomeOf(app: OutcomeApp): Outcome {
  const stages = new Set((app.stage_history ?? []).map((s) => s.stage));
  stages.add(app.stage);
  for (const s of stages) if (WIN_STAGES.has(s)) return "win";
  if (app.stage === "rejected") return "loss";
  if (app.stage === "withdrawn" && stages.has("applied")) return "loss";
  return null;
}

/** role_id → decided outcome, for every application with a verdict. */
export function decidedOutcomes(apps: OutcomeApp[]): Map<string, "win" | "loss"> {
  const out = new Map<string, "win" | "loss">();
  for (const a of apps) {
    if (!a.role_id) continue;
    const o = outcomeOf(a);
    if (o) out.set(a.role_id, o);
  }
  return out;
}

// ── role features (transparent, bounded) ────────────────────────────────────

export interface FeatureRole {
  archetype?: string | null;
  keywords?: unknown;
}

const KEYWORD_CAP = 6;

/** A role's learnable features: its archetype + top keywords, normalized. */
export function roleFeatures(role: FeatureRole | null | undefined): string[] {
  if (!role) return [];
  const feats: string[] = [];
  if (typeof role.archetype === "string" && role.archetype.trim()) {
    feats.push(`arch:${role.archetype.trim().toLowerCase()}`);
  }
  if (Array.isArray(role.keywords)) {
    for (const k of (role.keywords as unknown[]).slice(0, KEYWORD_CAP)) {
      if (typeof k === "string" && k.trim()) feats.push(`kw:${k.trim().toLowerCase()}`);
    }
  }
  return [...new Set(feats)];
}

/** Human label for a feature key ("platform" not "kw:platform"). */
export function featureLabel(feature: string): string {
  return feature.replace(/^(arch|kw):/, "");
}

// ── learning: per-feature conversion lifts with small-n shrinkage ───────────

export interface FeatureStat {
  n: number;
  wins: number;
  /** Shrunk lift in (−1, 1): (wins − n·base) / (n + K). 0 when no evidence. */
  lift: number;
}

export interface OutcomeLifts {
  /** Decided applications the learning stands on. */
  decided: number;
  wins: number;
  /** The user's own base conversion rate over decided apps. */
  base: number;
  byFeature: Map<string, FeatureStat>;
}

/** Small-n prior: two silent observations pull every lift toward zero. */
const SHRINK_K = 2;
/** Evidence floor: a feature seen once teaches nothing. */
const MIN_N = 2;

export function learnLifts(
  outcomes: Map<string, "win" | "loss">,
  featuresByRole: Map<string, string[]>,
): OutcomeLifts {
  const decided = outcomes.size;
  let wins = 0;
  for (const o of outcomes.values()) if (o === "win") wins++;
  const base = decided > 0 ? wins / decided : 0;

  const byFeature = new Map<string, FeatureStat>();
  if (decided === 0) return { decided, wins, base, byFeature };

  const counts = new Map<string, { n: number; wins: number }>();
  for (const [roleId, outcome] of outcomes) {
    for (const f of featuresByRole.get(roleId) ?? []) {
      const c = counts.get(f) ?? { n: 0, wins: 0 };
      c.n++;
      if (outcome === "win") c.wins++;
      counts.set(f, c);
    }
  }
  for (const [f, c] of counts) {
    if (c.n < MIN_N) continue;
    const lift = (c.wins - c.n * base) / (c.n + SHRINK_K);
    byFeature.set(f, { n: c.n, wins: c.wins, lift });
  }
  return { decided, wins, base, byFeature };
}

// ── application: bounded, explained fit adjustment ──────────────────────────

export interface FitBecause {
  feature: string; // human label
  wins: number;
  n: number;
}

export interface FitAdjustment {
  /** Rounded fit delta, clamped to ±MAX_DELTA. Never 0 (0 → no adjustment). */
  delta: number;
  adjusted: number;
  because: FitBecause[];
}

/** The overlay can nudge, never overrule: ±8 fit points at most. */
export const MAX_DELTA = 8;
/** One solid feature (2/2 at base 0.5 → lift 0.25) moves fit ~2–3 points. */
const LIFT_SCALE = 10;

export function adjustFit(
  baseFit: number | null | undefined,
  features: string[],
  lifts: OutcomeLifts,
): FitAdjustment | null {
  if (baseFit === null || baseFit === undefined || !Number.isFinite(baseFit)) return null;
  if (lifts.byFeature.size === 0) return null;

  const hits: Array<{ feature: string; stat: FeatureStat }> = [];
  for (const f of features) {
    const stat = lifts.byFeature.get(f);
    if (stat && stat.lift !== 0) hits.push({ feature: f, stat });
  }
  if (!hits.length) return null;

  const raw = hits.reduce((s, h) => s + h.stat.lift * LIFT_SCALE, 0);
  const delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, Math.round(raw)));
  if (delta === 0) return null;

  const because = hits
    .sort((a, b) => Math.abs(b.stat.lift) - Math.abs(a.stat.lift))
    .slice(0, 3)
    .map((h) => ({ feature: featureLabel(h.feature), wins: h.stat.wins, n: h.stat.n }));

  return { delta, adjusted: Math.max(0, Math.min(100, Math.round(baseFit + delta))), because };
}

// ── X3 score calibration read-back ──────────────────────────────────────────

export interface ScoreEvent {
  role_id?: string | null;
  likelihood?: string | null;
  created_at?: string;
}

export type Calibration = Partial<Record<"high" | "medium" | "low", { n: number; wins: number }>>;

/**
 * How did the user's past screen-likelihood scores actually convert? Latest
 * score per role, joined to decided outcomes only. Empty object = nothing to
 * say (never fabricate a stat).
 */
export function calibrateScores(
  events: ScoreEvent[],
  outcomes: Map<string, "win" | "loss">,
): Calibration {
  const latestByRole = new Map<string, string>();
  for (const e of events) {
    // events arrive newest-first; keep the first (latest) per role
    if (e.role_id && e.likelihood && !latestByRole.has(e.role_id)) {
      latestByRole.set(e.role_id, e.likelihood);
    }
  }
  const cal: Calibration = {};
  for (const [roleId, likelihood] of latestByRole) {
    if (likelihood !== "high" && likelihood !== "medium" && likelihood !== "low") continue;
    const outcome = outcomes.get(roleId);
    if (!outcome) continue;
    const bucket = cal[likelihood] ?? { n: 0, wins: 0 };
    bucket.n++;
    if (outcome === "win") bucket.wins++;
    cal[likelihood] = bucket;
  }
  return cal;
}

/** The one calibration sentence for the score card. Null = say nothing. */
export function calibrationLine(cal: Calibration, likelihood: string | null | undefined): string | null {
  const key = likelihood === "high" || likelihood === "medium" || likelihood === "low" ? likelihood : null;
  if (!key) return null;
  const b = cal[key];
  if (!b || b.n === 0) return null;
  const gently = b.n < 5 ? " — small sample, read gently" : "";
  return `Your past '${key}' scores converted ${b.wins}/${b.n} to a screen${gently}.`;
}

// ── server bridge (RLS-scoped; bounded) ─────────────────────────────────────

export interface UserOutcomeModel {
  lifts: OutcomeLifts;
  outcomes: Map<string, "win" | "loss">;
}

/**
 * Load the caller's outcome model in two bounded reads. Safe on empty data:
 * a user with no decided applications gets zero lifts and pages render
 * exactly as before.
 */
export async function loadOutcomeModel(supabase: SupabaseClient): Promise<UserOutcomeModel> {
  const { data: apps } = await supabase
    .from("applications")
    .select("role_id, stage, stage_history")
    .limit(500)
    .returns<OutcomeApp[]>();
  const outcomes = decidedOutcomes(apps ?? []);
  if (outcomes.size === 0) {
    return { lifts: learnLifts(new Map(), new Map()), outcomes };
  }

  const { data: roles } = await supabase
    .from("roles")
    .select("id, archetype, keywords")
    .in("id", [...outcomes.keys()])
    .limit(500);
  const featuresByRole = new Map<string, string[]>(
    (roles ?? []).map((r) => [r.id as string, roleFeatures(r as FeatureRole)]),
  );
  return { lifts: learnLifts(outcomes, featuresByRole), outcomes };
}

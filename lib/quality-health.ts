import { supabaseService } from "@/lib/supabase/service";

/**
 * THE "IT IS BROKEN" NUMBER (finding SH3).
 *
 * RoleOS had good observability and no threshold. `agent_runs` records every gate
 * verdict, `/admin` renders a pass rate, and `lib/cost-budget.ts` alerts on spend.
 * So the system could tell you what happened, and nothing anywhere said which
 * value of "what happened" means the product is broken right now. A dashboard
 * that nobody is watching at 02:00 is not detection.
 *
 * This module names the number. The signal chosen is the one that actually tracks
 * "RO is producing wrong output": the rate at which the quality gate refuses to
 * vouch for what it just produced. That is `needs_your_eyes`, plus `unknown`
 * confidence, over user-facing runs. It is the right signal because it is the
 * gate's own verdict about itself, so a bad prompt or a bad model change moves it
 * immediately and without anyone having to read the drafts.
 *
 * The baseline is not a guess dressed as a measurement: it is a floor chosen to
 * sit clearly above normal operation and clearly below "obviously on fire", and
 * the thresholds are exported and unit-tested so they can be revised against real
 * data rather than argued about. When there IS enough production history to fit a
 * baseline, that is the change to make; the number below is what holds until then,
 * and it is a stated number rather than no number at all.
 *
 * WHAT IS AND IS NOT BUILT, plainly:
 *   • BUILT: the measurement, the threshold, and a structured `quality_health.*`
 *     log line at warn/error level, on the same throttled best-effort path as the
 *     cost budget.
 *   • NOT BUILT: the notification. Nothing pages anyone. There is no alerting
 *     destination configured, no on-call rotation, and no escalation policy. The
 *     line lands in Cloudflare Workers Logs and waits to be read. Wiring a
 *     Workers Logs alert (or a webhook) to `event: "quality_health.breached"` is
 *     a console configuration step that has not been done, and saying so here is
 *     more useful than a module that implies someone gets woken up.
 *
 * `docs/runbooks/rollback.md` is what to DO when this fires.
 */

export type HealthLevel = "ok" | "warn" | "breached";

/**
 * The thresholds. Rates are over user-facing runs (sub-calls the gate makes about
 * another skill's output are excluded, exactly as `lib/admin-stats.ts` excludes
 * them, because a critic call is not a user-facing answer).
 */
export const QUALITY_THRESHOLDS = {
  /**
   * Minimum runs in the window before any rate is trusted. Below this, three bad
   * draws out of five is noise, not an incident, and paging on it trains people
   * to ignore the page.
   */
  minSamples: 20,
  /** Rolling window. Long enough to fill, short enough to catch a bad deploy fast. */
  windowMinutes: 60,
  /**
   * `needs_your_eyes` rate that means RO is shipping output it cannot vouch for.
   * Normal operation sits low: the gate exists to catch occasional misses, not a
   * quarter of everything. 0.25 is the breach line; 0.15 is the early warning.
   */
  needsEyesWarn: 0.15,
  needsEyesBreached: 0.25,
  /**
   * `unknown` confidence rate. A separate signal on purpose: a prompt change can
   * keep the status passing while collapsing the confidence band, and that is
   * still RO getting worse.
   */
  unknownWarn: 0.2,
  unknownBreached: 0.35,
} as const;

export interface HealthSample {
  /** The gate's status for this run. */
  status: string | null;
  /** The gate's confidence band for this run, when recorded. */
  confidence?: string | null;
  /** The skill id. Sub-calls (containing ":") are excluded from the rates. */
  skill: string | null;
}

export interface HealthAssessment {
  level: HealthLevel;
  /** Runs actually counted (user-facing only). */
  samples: number;
  needsEyesRate: number | null;
  unknownRate: number | null;
  /** Plain-language reasons, one per breached or warning threshold. */
  reasons: string[];
}

const isSubCall = (skill: string | null): boolean => !!skill && skill.includes(":");

/**
 * Pure: given the window's runs, is RO broken? Exported and tested separately
 * from the query, so the threshold logic can be reasoned about without a database.
 */
export function assessQualityHealth(samples: HealthSample[]): HealthAssessment {
  const rows = samples.filter((s) => !isSubCall(s.skill));
  const n = rows.length;
  if (n < QUALITY_THRESHOLDS.minSamples) {
    return {
      level: "ok",
      samples: n,
      needsEyesRate: null,
      unknownRate: null,
      reasons: [`only ${n} user-facing runs in the window; below the ${QUALITY_THRESHOLDS.minSamples}-run floor for a rate to mean anything`],
    };
  }

  const needsEyes = rows.filter((r) => r.status === "needs_your_eyes").length / n;
  const unknown = rows.filter((r) => r.confidence === "unknown").length / n;
  const reasons: string[] = [];
  let level: HealthLevel = "ok";

  const raise = (to: HealthLevel) => {
    if (to === "breached" || (to === "warn" && level === "ok")) level = to;
  };

  if (needsEyes >= QUALITY_THRESHOLDS.needsEyesBreached) {
    raise("breached");
    reasons.push(
      `needs_your_eyes rate ${(needsEyes * 100).toFixed(0)}% >= ${QUALITY_THRESHOLDS.needsEyesBreached * 100}% over ${n} runs`,
    );
  } else if (needsEyes >= QUALITY_THRESHOLDS.needsEyesWarn) {
    raise("warn");
    reasons.push(
      `needs_your_eyes rate ${(needsEyes * 100).toFixed(0)}% >= warn line ${QUALITY_THRESHOLDS.needsEyesWarn * 100}%`,
    );
  }

  if (unknown >= QUALITY_THRESHOLDS.unknownBreached) {
    raise("breached");
    reasons.push(
      `unknown-confidence rate ${(unknown * 100).toFixed(0)}% >= ${QUALITY_THRESHOLDS.unknownBreached * 100}% over ${n} runs`,
    );
  } else if (unknown >= QUALITY_THRESHOLDS.unknownWarn) {
    raise("warn");
    reasons.push(
      `unknown-confidence rate ${(unknown * 100).toFixed(0)}% >= warn line ${QUALITY_THRESHOLDS.unknownWarn * 100}%`,
    );
  }

  return { level, samples: n, needsEyesRate: needsEyes, unknownRate: unknown, reasons };
}

let lastCheckMs = 0;
const CHECK_EVERY_MS = 5 * 60_000;

/** Test seam: reset the isolate-local throttle. */
export function resetQualityHealthThrottle(): void {
  lastCheckMs = 0;
}

/**
 * Best-effort rolling check plus a structured log line. Throttled per isolate and
 * never throws: telemetry must not add load or take the product down.
 *
 * Emits nothing at `ok`. At `warn` and `breached` it emits one JSON line whose
 * `event` field is stable and greppable, so a Workers Logs alert can be attached
 * to it without touching this code. Attaching that alert is the step that is NOT
 * done; see the module header.
 */
export async function checkQualityHealth(now = Date.now()): Promise<HealthAssessment | null> {
  if (now - lastCheckMs < CHECK_EVERY_MS) return null;
  lastCheckMs = now;
  try {
    const db = supabaseService();
    const since = new Date(now - QUALITY_THRESHOLDS.windowMinutes * 60_000).toISOString();
    const { data } = await db
      .from("agent_runs")
      .select("skill, judge_verdict")
      .gte("created_at", since)
      .limit(2000);

    const samples: HealthSample[] = (data ?? []).map(
      (r: { skill: string | null; judge_verdict: { status?: string; confidence?: string } | null }) => ({
        skill: r.skill,
        status: r.judge_verdict?.status ?? null,
        confidence: r.judge_verdict?.confidence ?? null,
      }),
    );

    const health = assessQualityHealth(samples);
    if (health.level !== "ok") {
      console.warn(
        JSON.stringify({
          t: new Date(now).toISOString(),
          level: health.level === "breached" ? "error" : "warn",
          event: `quality_health.${health.level}`,
          samples: health.samples,
          needs_your_eyes_rate: health.needsEyesRate,
          unknown_confidence_rate: health.unknownRate,
          reasons: health.reasons,
          runbook: "docs/runbooks/rollback.md",
        }),
      );
    }
    return health;
  } catch {
    /* telemetry never blocks or throws */
    return null;
  }
}

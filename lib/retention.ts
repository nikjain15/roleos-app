/**
 * Retention windows, the ENFORCED source of truth.
 *
 * Every window RoleOS states in `docs/PRIVACY.md` and on `/privacy` is read from
 * this file, and the nightly purge (`app/api/cron/purge/route.ts`) deletes from
 * exactly these rules. If a number changes here it changes in the notice and in
 * the job at the same time. That is deliberate: the failure this repo already
 * recorded once was a retention window that lived in prose and nothing enforced.
 *
 * Scope note, stated honestly: these rules cover the time-boxed OPERATIONAL rows
 * (rate-limit counters, cost telemetry, delivered notifications). The rows that
 * hold what the user actually wrote (profile, artifacts, decisions, memory) are
 * NOT time-boxed. They are kept for as long as the account exists and are
 * removed by the delete path (`lib/account-delete.ts`), because deleting
 * someone's CV out from under them on a timer would be a worse product, not a
 * more private one. `docs/PRIVACY.md` says this in the same words.
 *
 * Pure module: no database import, no env. The job supplies the client.
 */

export interface RetentionRule {
  /** Postgres table the rule purges. */
  table: string;
  /** Timestamp column the window is measured against. */
  column: string;
  /** How long a row may live, in days. */
  days: number;
  /** Optional narrowing: only rows whose `statusColumn` is one of these values. */
  onlyStatusIn?: { column: string; values: string[] };
  /** Why this window and not another. Rendered in the notice. */
  why: string;
}

/**
 * The enforced windows. Each one is short enough to be defensible and long
 * enough that the thing the data exists for still works.
 */
export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    table: "rate_events",
    column: "created_at",
    days: 7,
    why: "Rate-limit counters, keyed by IP address for signed-out requests. The longest window the limiter actually reads is 60 minutes (lib/rate-limit.ts); the extra days only exist so abuse is still visible after a weekend.",
  },
  {
    table: "index_ask_events",
    column: "created_at",
    days: 7,
    why: "The same counter for the public Index ask box, also keyed by IP address.",
  },
  {
    table: "notifications",
    column: "created_at",
    days: 90,
    onlyStatusIn: { column: "status", values: ["read", "dismissed"] },
    why: "Digests and nudges the user has already read or dismissed. Unread items are left alone so nothing disappears before it has been seen.",
  },
  {
    table: "agent_runs",
    column: "created_at",
    days: 180,
    why: "Per-call cost and latency telemetry (model name, token counts, cost, latency, gate verdict). No prompt text and no model output is written to this table; see lib/agent-runs.ts.",
  },
] as const;

/** One rule, resolved against a clock: everything older than this goes. */
export interface PurgeStep {
  rule: RetentionRule;
  /** ISO timestamp; rows with `column` strictly older than this are deleted. */
  cutoff: string;
}

/** Resolve every rule against `now`. Pure, this is what the tests assert on. */
export function purgePlan(now: Date = new Date()): PurgeStep[] {
  return RETENTION_RULES.map((rule) => ({
    rule,
    cutoff: new Date(now.getTime() - rule.days * 86_400_000).toISOString(),
  }));
}

/** Human-readable window ("7 days"), for the notice and the settings copy. */
export function windowLabel(rule: RetentionRule): string {
  return rule.days === 1 ? "1 day" : `${rule.days} days`;
}

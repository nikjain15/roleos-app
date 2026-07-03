import { supabaseService } from "@/lib/supabase/service";

// Structured console lines (Workers Logs indexes these). Uses console directly
// so this slice doesn't depend on H1's lib/log; swap to logWarn once merged.
const warn = (event: string, fields: Record<string, unknown>) =>
  console.warn(JSON.stringify({ t: new Date().toISOString(), level: "warn", event, ...fields }));

/**
 * Shared rolling-window rate limiting (slice H3) — the index-ask pattern,
 * generalized. Counts requests in `rate_events` per (scope, subject) where
 * scope names the route and subject is an IP (anon) or user id (authed).
 * Service-role writes only; the table is deny-all to clients.
 *
 * Fail-open BY DESIGN: if the limiter's own storage hiccups we allow the
 * request (an outage must never take the product down) — but we log it.
 * Server-only — never import into a client component.
 */

export interface RateLimit {
  /** requests allowed per window */
  max: number;
  /** window length in minutes */
  windowMin: number;
}

/** Per-route budgets. Model-calling routes are tight; cheap routes go untouched. */
export const LIMITS: Record<string, RateLimit> = {
  explore_ask: { max: 20, windowMin: 60 }, // anon, per IP (unchanged from 0009)
  onboard: { max: 5, windowMin: 60 }, // anon, per IP — the most expensive public path
  ro_ask: { max: 30, windowMin: 60 }, // authed, per user
  tailor: { max: 12, windowMin: 60 }, // authed, per user — drafting is pricey
  rematch: { max: 6, windowMin: 60 }, // authed, per user — full pipeline run
};

/** Best client IP on Workers/proxies; "unknown" still gets limited as one bucket. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export interface RateResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Count the window and record this request. One head-count + one insert,
 * both on the (scope, subject, created_at) index.
 */
export async function checkRateLimit(scope: keyof typeof LIMITS, subject: string): Promise<RateResult> {
  const limit = LIMITS[scope];
  try {
    const db = supabaseService();
    const since = new Date(Date.now() - limit.windowMin * 60_000).toISOString();
    const { count, error } = await db
      .from("rate_events")
      .select("*", { count: "exact", head: true })
      .eq("scope", scope)
      .eq("subject", subject)
      .gte("created_at", since);
    if (error) throw error;
    const used = count ?? 0;
    if (used >= limit.max) {
      warn("rate_limit.hit", { scope, used, max: limit.max });
      return { allowed: false, remaining: 0 };
    }
    await db.from("rate_events").insert({ scope, subject });
    return { allowed: true, remaining: limit.max - used - 1 };
  } catch (err) {
    warn("rate_limit.degraded", { scope, error: err instanceof Error ? err.message : String(err) });
    return { allowed: true, remaining: 1 }; // fail-open, logged
  }
}

/** The honest 429 body every limited route returns. */
export function rateLimitResponse(message?: string): Response {
  return Response.json(
    {
      error:
        message ??
        "You've hit the hourly limit for this — it protects everyone's costs. It resets within the hour.",
    },
    { status: 429 },
  );
}

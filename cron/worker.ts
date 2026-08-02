/**
 * RoleOS ambient scheduler — a tiny dedicated cron worker (kept separate so the
 * live OpenNext app worker is never touched). On its schedule it calls the
 * app's secret-gated /api/cron/digests, which builds a digest for each user who
 * is due (cadence + self-quieting). This is the "ambient agent" firing in the
 * background (architecture.md §1.2 — implemented as cron, the two-way-door
 * alternative to a per-user DO; promotable later).
 *
 * Deploy:  npx wrangler deploy -c cron/wrangler.jsonc
 * Secret:  npx wrangler secret put CRON_SECRET -c cron/wrangler.jsonc
 */
interface Env {
  CRON_SECRET: string;
  APP_URL: string;
}

async function hit(env: Env, path: string): Promise<{ path: string; status: number; body: string }> {
  const res = await fetch(`${env.APP_URL}${path}`, {
    method: "POST",
    headers: { "x-cron-secret": env.CRON_SECRET },
  });
  return { path, status: res.status, body: (await res.text()).slice(0, 300) };
}

// Hourly ambient jobs: build due digests + goal-anchored pace nudges + hunt new
// roles. Nudges are throttled to ≤1/48h per user server-side, so hourly is safe.
async function fireHourly(env: Env) {
  return Promise.all([
    hit(env, "/api/cron/digests"),
    hit(env, "/api/cron/nudges"),
    hit(env, "/api/cron/ingest"),
  ]);
}

// Daily: refresh the YC company layer (yc-oss rebuilds daily). New/enabled YC
// companies are then sourced by the hourly /api/cron/ingest above.
async function fireDaily(env: Env) {
  return Promise.all([hit(env, "/api/cron/yc-sync")]);
}

// Nightly (X1): the overnight autonomous hunt — re-match each eligible user,
// pre-draft truth-gated résumés for their top fresh pursues, queue them in the
// Tracker "Ready" lane. Server-side: ≤1 hunt per user per 20h, tight caps,
// stands down over cost budget. Drafts only — sending stays a human click.
//
// The same nightly slot runs the retention purge, which deletes the time-boxed
// operational rows past the windows in lib/retention.ts (IP-keyed rate counters,
// read notifications, old cost telemetry). It is the job that makes the windows
// stated in docs/PRIVACY.md real rather than aspirational.
async function fireNightly(env: Env) {
  return Promise.all([hit(env, "/api/cron/hunt"), hit(env, "/api/cron/purge")]);
}

// Cron expressions (must match the "triggers" entries in wrangler.jsonc).
const DAILY_CRON = "0 6 * * *";
const NIGHTLY_CRON = "30 2 * * *";

export default {
  // Cloudflare cron trigger. Branch on which schedule fired (event.cron).
  async scheduled(
    event: { cron?: string },
    env: Env,
    ctx: { waitUntil(p: Promise<unknown>): void },
  ) {
    ctx.waitUntil(
      event.cron === DAILY_CRON
        ? fireDaily(env)
        : event.cron === NIGHTLY_CRON
          ? fireNightly(env)
          : fireHourly(env),
    );
  },

  // Manual trigger for testing: GET /?secret=...[&only=ingest|digests|nudges|yc-sync|hunt|purge]
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    if (u.searchParams.get("secret") !== env.CRON_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const only = u.searchParams.get("only");
    const r =
      only === "ingest"
        ? [await hit(env, "/api/cron/ingest")]
        : only === "digests"
          ? [await hit(env, "/api/cron/digests")]
          : only === "nudges"
            ? [await hit(env, "/api/cron/nudges")]
            : only === "yc-sync"
              ? [await hit(env, "/api/cron/yc-sync")]
              : only === "hunt"
                ? [await hit(env, "/api/cron/hunt")]
                : only === "purge"
                  ? [await hit(env, "/api/cron/purge")]
                  : await fireHourly(env);
    return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
  },
};

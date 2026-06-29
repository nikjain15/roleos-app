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

// Hourly ambient jobs: build due digests + hunt new roles (demand-driven ingest).
async function fireHourly(env: Env) {
  return Promise.all([hit(env, "/api/cron/digests"), hit(env, "/api/cron/ingest")]);
}

// Daily: refresh the YC company layer (yc-oss rebuilds daily). New/enabled YC
// companies are then sourced by the hourly /api/cron/ingest above.
async function fireDaily(env: Env) {
  return Promise.all([hit(env, "/api/cron/yc-sync")]);
}

// The daily cron expression (must match the "daily" entry in wrangler.jsonc).
const DAILY_CRON = "0 6 * * *";

export default {
  // Cloudflare cron trigger. Branch on which schedule fired (event.cron).
  async scheduled(
    event: { cron?: string },
    env: Env,
    ctx: { waitUntil(p: Promise<unknown>): void },
  ) {
    ctx.waitUntil(event.cron === DAILY_CRON ? fireDaily(env) : fireHourly(env));
  },

  // Manual trigger for testing: GET /?secret=...[&only=ingest|digests|yc-sync]
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
          : only === "yc-sync"
            ? [await hit(env, "/api/cron/yc-sync")]
            : await fireHourly(env);
    return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
  },
};

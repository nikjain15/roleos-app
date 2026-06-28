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

async function fireDigests(env: Env): Promise<{ status: number; body: string }> {
  const res = await fetch(`${env.APP_URL}/api/cron/digests`, {
    method: "POST",
    headers: { "x-cron-secret": env.CRON_SECRET },
  });
  return { status: res.status, body: (await res.text()).slice(0, 500) };
}

export default {
  // Cloudflare cron trigger.
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(fireDigests(env));
  },

  // Manual trigger for testing: GET /?secret=... — same secret, never public.
  async fetch(req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).searchParams.get("secret") !== env.CRON_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const r = await fireDigests(env);
    return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
  },
};

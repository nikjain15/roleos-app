/**
 * RoleOS IngestWorkflow (docs/admin-ingestion.md Phase 2b) — a durable Cloudflare
 * Workflow. Each company is one retryable, observable step that scans → extracts
 * → embeds → prunes via the app's secret-gated /api/admin/ingest. Durable
 * execution = per-company retries + survival across the teardown problem, and it
 * lifts the bounded sync run's per-run cap. The main OpenNext app is untouched
 * (HTTP only).
 *
 * Deploy:  npx wrangler deploy -c ingest/wrangler.jsonc
 * Secret:  npx wrangler secret put CRON_SECRET -c ingest/wrangler.jsonc
 * Start:   POST https://roleos-ingest.<sub>.workers.dev/start?secret=...
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

interface Env {
  INGEST: Workflow;
  CRON_SECRET: string;
  APP_URL: string;
}

async function callApp(env: Env, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${env.APP_URL}/api/admin/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": env.CRON_SECRET },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`app ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Record<string, unknown>;
}

export class IngestWorkflow extends WorkflowEntrypoint<Env> {
  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep) {
    const { companies } = (await step.do("list-companies", () =>
      callApp(this.env, { op: "companies" }),
    )) as { companies: string[] };

    let scanned = 0;
    let added = 0;
    let closed = 0;
    for (const name of companies ?? []) {
      const r = await step.do(
        `reconcile:${name}`,
        { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" }, timeout: "5 minutes" },
        () => callApp(this.env, { op: "reconcile", company: name }),
      );
      scanned += Number(r.scanned ?? 0);
      added += Number(r.added ?? 0);
      closed += Number(r.closed ?? 0);
    }
    return { companies: (companies ?? []).length, scanned, added, closed };
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    if (u.searchParams.get("secret") !== env.CRON_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    if (u.pathname === "/start") {
      const instance = await env.INGEST.create();
      return Response.json({ id: instance.id });
    }
    if (u.pathname === "/status") {
      const id = u.searchParams.get("id");
      if (!id) return Response.json({ error: "id required" }, { status: 400 });
      const instance = await env.INGEST.get(id);
      return Response.json({ id, status: await instance.status() });
    }
    return new Response("not found", { status: 404 });
  },
};

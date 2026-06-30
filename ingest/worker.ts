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

/**
 * Companies reconciled per workflow INSTANCE. Each instance is a fresh execution
 * with its own subrequest budget, so a small batch can't exhaust it. The instance
 * then spawns the next one while work remains. (Why not one instance + step.sleep:
 * the runtime accumulates subrequests across steps in a single invocation and a
 * short sleep doesn't reliably reset it — a 366-company sweep died with "Too many
 * subrequests". Separate instances sidestep that deterministically.)
 */
const BATCH = 12;
/** Hard stop on the chain length — backstop against a runaway (real sweeps need
 *  ~30 hops for the whole enabled set). */
const MAX_DEPTH = 80;

export class IngestWorkflow extends WorkflowEntrypoint<Env> {
  async run(event: WorkflowEvent<unknown>, step: WorkflowStep) {
    const depth = Number((event.payload as { depth?: number } | undefined)?.depth ?? 0);

    // Pull the next batch of never-scanned companies (+ how many remain total).
    const { companies, remaining } = (await step.do("list-unscanned", () =>
      callApp(this.env, { op: "unscanned", limit: BATCH }),
    )) as { companies: string[]; remaining: number };

    let scanned = 0;
    let added = 0;
    let closed = 0;
    let failed = 0;
    for (const name of companies) {
      try {
        const r = await step.do(
          `reconcile:${name}`,
          { retries: { limit: 1, delay: "10 seconds", backoff: "exponential" }, timeout: "5 minutes" },
          () => callApp(this.env, { op: "reconcile", company: name }),
        );
        scanned += Number(r.scanned ?? 0);
        added += Number(r.added ?? 0);
        closed += Number(r.closed ?? 0);
      } catch {
        failed++; // isolate: skip the company, keep going
      }
    }

    // Chain the next instance while a full batch was processed (more likely remain)
    // and we're under the runaway guard. reconcile marks each company scanned, so
    // the next instance's `unscanned` query naturally excludes everything done here.
    const more = companies.length === BATCH && remaining > companies.length && depth < MAX_DEPTH;
    if (more) {
      await step.do("chain-next", async () => {
        const next = await this.env.INGEST.create({ params: { depth: depth + 1 } });
        return { id: next.id };
      });
    }

    return { depth, processed: companies.length, remaining, scanned, added, closed, failed, chained: more };
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

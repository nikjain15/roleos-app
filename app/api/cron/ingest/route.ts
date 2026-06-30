import { NextResponse } from "next/server";
import { runIngestion, listUnscannedCompanyNames } from "@/lib/ingest";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The deployed durable IngestWorkflow worker (docs/admin-ingestion.md Phase 2b).
// It scans the enabled set in self-chaining batches with per-company retries.
const INGEST_WORKER_URL = "https://roleos-ingest.nikjain1588.workers.dev";

/**
 * Hourly ambient ingest. Called by the cron worker. Two passes:
 *   1. A bounded synchronous `demand` scan — only the companies users are
 *      actively hunting. Small, stays within the request budget, records an
 *      `ingestion_runs` row.
 *   2. The rest of the enabled set is handed to the durable IngestWorkflow.
 *      Scanning all ~366 enabled companies inline used to time out and leave
 *      `ingestion_runs` rows stuck at status='scanning' forever; the Workflow
 *      does it durably (batched, per-company retries, self-chaining instances).
 * Secret-gated; service-role; no send.
 */
export async function POST(req: Request): Promise<Response> {
  const expected = env().CRON_SECRET;
  if (!expected || req.headers.get("x-cron-secret") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    // 1) Bounded demand pass — fresh, within the request budget.
    const demand = await runIngestion({ trigger: "cron", scope: { kind: "demand" }, maxPerCompany: 6 });

    // 2) Backfill never-scanned enabled companies via the durable Workflow. Only
    //    kick it off when something is actually unscanned, so we don't spawn a
    //    no-op instance every hour once the corpus is caught up.
    const { remaining } = await listUnscannedCompanyNames(1);
    let durable: { started: boolean; id?: string } = { started: false };
    if (remaining > 0) {
      const res = await fetch(`${INGEST_WORKER_URL}/start?secret=${encodeURIComponent(expected)}`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string };
      durable = { started: res.ok, id: j.id };
    }

    return NextResponse.json({ demand, remaining, durable });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ingest failed" }, { status: 500 });
  }
}

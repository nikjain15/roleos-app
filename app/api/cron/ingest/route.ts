import { NextResponse } from "next/server";
import { runIngestion } from "@/lib/ingest";
import { type IngestScope } from "@/lib/ingest/scan";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Demand-driven ingestion run (the ambient hunt). Called by the cron worker.
 * Table-driven now: reads the admin-managed `companies` table (scope), scans
 * each board, adds + embeds the new roles, and records an `ingestion_runs` row.
 * Secret-gated; service-role; no send. (The durable IngestWorkflow + per-role
 * Claude extract land in Phase 2 — see docs/admin-ingestion.md.)
 */
export async function POST(req: Request): Promise<Response> {
  const expected = env().CRON_SECRET;
  if (!expected || req.headers.get("x-cron-secret") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Cron favours demand, but falls back to the full enabled list if no one is
  // watching specific companies yet.
  let scope: IngestScope = { kind: "demand" };
  try {
    const summary = await runIngestion({ trigger: "cron", scope, maxPerCompany: 6 });
    if (summary.companies === 0) {
      scope = { kind: "all" };
      const full = await runIngestion({ trigger: "cron", scope, maxPerCompany: 6 });
      return NextResponse.json(full);
    }
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ingest failed" }, { status: 500 });
  }
}

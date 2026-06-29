import { NextResponse } from "next/server";
import { syncYcCompanies } from "@/lib/ingest";
import { supabaseService } from "@/lib/supabase/service";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * YC company sync (the "company layer" feeder). Called by the roleos-cron worker
 * on its daily trigger — yc-oss rebuilds daily, so daily is the natural cadence;
 * the existing hourly /api/cron/ingest then sources roles from whatever YC
 * companies this enabled. Records an `ingestion_runs` row so /admin shows it
 * alongside ATS runs. Secret-gated; service-role; no send.
 */
export async function POST(req: Request): Promise<Response> {
  const expected = env().CRON_SECRET;
  if (!expected || req.headers.get("x-cron-secret") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const db = supabaseService();
  const { data: run } = await db
    .from("ingestion_runs")
    .insert({ trigger: "cron", scope: { kind: "yc" }, status: "scanning" })
    .select("id")
    .single();
  const runId = (run as { id: string } | null)?.id;

  try {
    const summary = await syncYcCompanies();
    if (runId) {
      await db
        .from("ingestion_runs")
        .update({
          status: "done",
          scanned: summary.fetched,
          new_count: summary.inserted,
          detail: summary,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return NextResponse.json(summary);
  } catch (e) {
    const error = e instanceof Error ? e.message : "yc sync failed";
    if (runId) {
      await db
        .from("ingestion_runs")
        .update({ status: "error", error, finished_at: new Date().toISOString() })
        .eq("id", runId);
    }
    return NextResponse.json({ error }, { status: 500 });
  }
}

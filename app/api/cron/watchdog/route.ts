import { NextResponse } from "next/server";
import { listDueCompanyNames, sweepInProgress } from "@/lib/ingest";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INGEST_WORKER_URL = "https://roleos-ingest.nikjain1588.workers.dev";
/**
 * Idle minutes before a chain counts as dead. The durable IngestWorkflow chain
 * stops on its own roughly every 156 companies (observed repeatedly on
 * 2026-08-08; cause undiagnosed, needs Workers log access). Recovery used to
 * depend on the hourly ingest cron, costing up to an hour of dead time per
 * stall — six stalls in one sweep. Six minutes is comfortably longer than a
 * single company reconcile (~60s worst case) and short enough that a dead chain
 * is not left sitting.
 */
const STALL_MINUTES = 6;

/**
 * Sweep watchdog. Runs every 5 minutes: if companies are due and nothing has
 * been scanned recently, the chain is dead — start a new one. Idempotent, since
 * due-ness lives in `companies.next_scan_at` rather than in chain state, so a
 * restart simply resumes where the dead chain stopped.
 *
 * Stays quiet when there is no work: an empty queue is the normal steady state
 * between cadences, not a stall.
 */
export async function POST(req: Request): Promise<Response> {
  const expected = env().CRON_SECRET;
  if (!expected || req.headers.get("x-cron-secret") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const { remaining } = await listDueCompanyNames(1);
    if (remaining === 0) return NextResponse.json({ due: 0, action: "idle" });

    // Work is due — is a chain actually making progress on it?
    if (await sweepInProgress(Date.now(), STALL_MINUTES * 60_000)) {
      return NextResponse.json({ due: remaining, action: "healthy" });
    }
    const res = await fetch(`${INGEST_WORKER_URL}/start?secret=${encodeURIComponent(expected)}`, { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return NextResponse.json({ due: remaining, action: res.ok ? "restarted" : "restart_failed", id: j.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "watchdog failed" }, { status: 500 });
  }
}

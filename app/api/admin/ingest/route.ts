import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { runIngestion, reconcileCompany, listEnabledCompanyNames } from "@/lib/ingest";
import { type IngestScope } from "@/lib/ingest/scan";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Ingestion control (docs/admin-ingestion.md).
 *
 * TWO callers, two auth paths:
 *  • The admin UI (cookie session) → requireAdmin → a bounded synchronous run.
 *  • The durable IngestWorkflow worker (server-to-server, x-cron-secret) → per-
 *    `op` primitives it orchestrates one durable step at a time:
 *      {op:"companies"}            → list enabled company names
 *      {op:"reconcile", company}   → scan+extract+embed+prune ONE company
 * No send.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = env().CRON_SECRET;
  const internal = !!expected && secret === expected;

  const body = (await req.json().catch(() => ({}))) as {
    op?: "companies" | "reconcile";
    company?: string;
    scope?: "all" | "demand" | { companies?: string[] };
  };

  // ── internal (Workflow) ──────────────────────────────────────────────────
  if (internal) {
    try {
      if (body.op === "companies") {
        return NextResponse.json({ companies: await listEnabledCompanyNames() });
      }
      if (body.op === "reconcile" && body.company) {
        return NextResponse.json(await reconcileCompany(body.company));
      }
      return NextResponse.json({ error: "unknown op" }, { status: 400 });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "op failed" },
        { status: 500 },
      );
    }
  }

  // ── admin UI (cookie) — bounded synchronous run ──────────────────────────
  await requireAdmin();
  let scope: IngestScope = { kind: "all" };
  if (body.scope === "demand") scope = { kind: "demand" };
  else if (body.scope && typeof body.scope === "object" && Array.isArray(body.scope.companies)) {
    scope = { kind: "company", companies: body.scope.companies };
  }
  try {
    const summary = await runIngestion({ trigger: "admin", scope });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "ingest failed" },
      { status: 500 },
    );
  }
}

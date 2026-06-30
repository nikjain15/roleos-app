import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { runIngestion, reconcileCompany, listEnabledCompanyNames, listUnscannedCompanyNames, syncYcCompanies, promoteYcCandidates } from "@/lib/ingest";
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
    op?: "companies" | "unscanned" | "reconcile" | "yc-sync" | "yc-promote";
    company?: string;
    count?: number;
    limit?: number;
    scope?: "all" | "demand" | "yc" | { companies?: string[] };
    durable?: boolean;
  };

  // The deployed IngestWorkflow worker (Phase 2b). The app starts an instance;
  // the Workflow then drives this same route per-company over the internal path.
  const INGEST_WORKER_URL = "https://roleos-ingest.nikjain1588.workers.dev";

  // ── internal (Workflow) ──────────────────────────────────────────────────
  if (internal) {
    try {
      if (body.op === "companies") {
        return NextResponse.json({ companies: await listEnabledCompanyNames() });
      }
      if (body.op === "unscanned") {
        return NextResponse.json(await listUnscannedCompanyNames(body.limit ?? 12));
      }
      if (body.op === "reconcile" && body.company) {
        return NextResponse.json(await reconcileCompany(body.company));
      }
      if (body.op === "yc-sync") {
        return NextResponse.json(await syncYcCompanies());
      }
      if (body.op === "yc-promote") {
        return NextResponse.json(await promoteYcCandidates(body.count ?? 100));
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

  // Durable full run: start an IngestWorkflow instance (unbounded, retried,
  // per-company steps) and return its id. The Workflow drives the internal path.
  if (body.durable) {
    try {
      const res = await fetch(
        `${INGEST_WORKER_URL}/start?secret=${encodeURIComponent(env().CRON_SECRET ?? "")}`,
        { method: "POST" },
      );
      const j = (await res.json()) as { id?: string };
      return NextResponse.json({ ok: res.ok, durable: true, id: j.id });
    } catch {
      return NextResponse.json({ ok: false, error: "couldn't start the workflow" }, { status: 502 });
    }
  }
  // YC sync is a company-layer feeder (no scan/extract) — handle it before the
  // role-ingestion scopes.
  if (body.op === "yc-sync" || body.scope === "yc") {
    try {
      const summary = await syncYcCompanies();
      return NextResponse.json({ ok: true, ...summary });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "yc sync failed" },
        { status: 500 },
      );
    }
  }
  // Promote the next N disabled YC candidates to enabled (ranked, ceiling-bounded).
  if (body.op === "yc-promote") {
    try {
      const summary = await promoteYcCandidates(body.count ?? 100);
      return NextResponse.json({ ok: true, ...summary });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "promote failed" },
        { status: 500 },
      );
    }
  }
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

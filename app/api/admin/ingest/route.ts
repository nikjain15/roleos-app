import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { runIngestion } from "@/lib/ingest";
import { type IngestScope } from "@/lib/ingest/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Admin "Run ingestion" (docs/admin-ingestion.md). requireAdmin re-checks
 * role === 'admin' (the real lock). Runs a bounded scan → extract → embed pass
 * for the chosen scope and returns the summary. Phase 2a is synchronous +
 * budgeted; the durable IngestWorkflow (Phase 2b) replaces this for unbounded,
 * retried fan-out. No send.
 */
export async function POST(req: Request): Promise<Response> {
  await requireAdmin();

  const body = (await req.json().catch(() => ({}))) as {
    scope?: "all" | "demand" | { companies?: string[] };
  };

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

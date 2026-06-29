"use client";

import { useState } from "react";

/**
 * Admin "Run ingestion" control (docs/admin-ingestion.md Phase 2a). Triggers a
 * bounded scan → extract → embed pass for a scope and shows the result. Admin-
 * only (the route re-checks role === 'admin'). Refreshes the page so the new
 * counts + run row show in the panels above.
 */
type Result = { ok: boolean; companies?: number; scanned?: number; added?: number; error?: string };

export default function IngestRunner() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(scope: "all" | "demand", label: string) {
    setBusy(label);
    setResult(null);
    try {
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      setResult((await res.json()) as Result);
    } catch {
      setResult({ ok: false, error: "request failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-bd bg-surf p-4">
      <p className="text-xs font-medium text-tx">Run ingestion now</p>
      <p className="mt-1 text-[11px] text-tx3">
        Scans ATS boards, structures new roles (Claude), and embeds them. Bounded per run — click
        again to keep catching up. (Durable unbounded runs land with the Workflow.)
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => run("demand", "demand")}
          disabled={!!busy}
          className="rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy === "demand" ? "Running…" : "Run — demand companies"}
        </button>
        <button
          onClick={() => run("all", "all")}
          disabled={!!busy}
          className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2 disabled:opacity-40"
        >
          {busy === "all" ? "Running…" : "Run — all enabled"}
        </button>
        {busy && <span className="text-[11px] text-tx3">scanning + structuring… this can take a minute</span>}
      </div>
      {result && (
        <p className={`mt-3 text-xs ${result.ok ? "text-suc" : "text-dng"}`}>
          {result.ok
            ? `Done — ${result.companies} companies, ${result.scanned} scanned, +${result.added} added. Refresh to see them above.`
            : `Failed: ${result.error ?? "unknown"}`}
        </p>
      )}
    </div>
  );
}

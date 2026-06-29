"use client";

import { useState } from "react";

/**
 * Admin "Run ingestion" control (docs/admin-ingestion.md Phase 2a). Triggers a
 * bounded scan → extract → embed pass for a scope, or a YC company sync (the
 * company-layer feeder), and shows the result. Admin-only (the route re-checks
 * role === 'admin'). Refreshes the page so the new counts + run row show above.
 */
type Result = {
  ok: boolean;
  error?: string;
  // role ingestion (scope all/demand)
  companies?: number;
  scanned?: number;
  added?: number;
  // yc sync
  inserted?: number;
  enabled?: number;
  existing?: number;
  // durable workflow
  durable?: boolean;
  id?: string;
};

export default function IngestRunner() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function post(body: object, label: string) {
    setBusy(label);
    setResult(null);
    try {
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setResult((await res.json()) as Result);
    } catch {
      setResult({ ok: false, error: "request failed" });
    } finally {
      setBusy(null);
    }
  }

  const run = (scope: "all" | "demand", label: string) => post({ scope }, label);
  const syncYc = () => post({ op: "yc-sync" }, "yc");
  const runDurable = () => post({ durable: true }, "durable");

  const summary = (r: Result) =>
    r.durable
      ? `Started a durable full run (${r.id?.slice(0, 8) ?? "?"}…). It hunts every company in the background, retrying per company — refresh in a few minutes to watch the corpus grow.`
      : busyWasYc(r)
        ? `Done — +${r.inserted} YC companies added (${r.enabled} enabled, ${r.existing} already had). Refresh to see them above.`
        : `Done — ${r.companies} companies, ${r.scanned} scanned, +${r.added} added. Refresh to see them above.`;

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
        <button
          onClick={syncYc}
          disabled={!!busy}
          className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2 disabled:opacity-40"
        >
          {busy === "yc" ? "Syncing…" : "Sync YC companies"}
        </button>
        <button
          onClick={runDurable}
          disabled={!!busy}
          className="rounded-md border border-suc px-3 py-1.5 text-xs font-medium text-suc disabled:opacity-40"
        >
          {busy === "durable" ? "Starting…" : "Run full (durable) ⚡"}
        </button>
        {busy && <span className="text-[11px] text-tx3">working… this can take a minute</span>}
      </div>
      {result && (
        <p className={`mt-3 text-xs ${result.ok ? "text-suc" : "text-dng"}`}>
          {result.ok ? summary(result) : `Failed: ${result.error ?? "unknown"}`}
        </p>
      )}
    </div>
  );
}

/** A YC-sync result carries `inserted`; a role-ingestion result carries `scanned`. */
function busyWasYc(r: Result): boolean {
  return typeof r.inserted === "number";
}

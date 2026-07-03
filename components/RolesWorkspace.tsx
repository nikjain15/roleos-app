"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TailorButton from "@/components/TailorButton";
import { curate, type SortKey, type Verdict, type WorkspaceRole } from "@/lib/workspace";

/**
 * The Roles Workspace board (Slice 5). Sort + filter over the already-reasoned
 * matches, save/dismiss/pursue with optimistic local re-rank (no model call), and
 * an inline "why this fits" from the stored rationale. A full re-match is a separate
 * explicit refresh. Responsive: single scannable column on mobile. a11y: labelled
 * controls, ≥40px targets, honest empty state.
 */
const VERDICT_STYLE: Record<Verdict, string> = {
  pursue: "bg-suc-bg text-suc",
  maybe: "bg-info-bg text-info-tx",
  skip: "bg-surf2 text-tx3",
  unknown: "bg-surf2 text-tx3",
};

export default function RolesWorkspace({ initial }: { initial: WorkspaceRole[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [sort, setSort] = useState<SortKey>("fit");
  const [verdict, setVerdict] = useState<Verdict | "all">("all");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const shown = useMemo(
    () => curate(rows, sort, { verdict, company, location, remoteOnly }),
    [rows, sort, verdict, company, location, remoteOnly],
  );

  async function act(role_id: string, action: "save" | "dismiss" | "pursue" | "restore") {
    setBusy(role_id);
    const status = { save: "saved", dismiss: "dismissed", pursue: "pursuing", restore: "new" }[action];
    setRows((rs) => rs.map((r) => (r.role_id === role_id ? { ...r, status } : r))); // optimistic
    try {
      await fetch("/api/match/curate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_id, action }),
      });
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch("/api/rematch", { method: "POST" });
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  const dismissedCount = rows.filter((r) => r.status === "dismissed").length;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-bd bg-surf p-3">
        <label className="text-xs text-tx3">
          <span className="block">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={ctl}>
            <option value="fit">Best fit</option>
            <option value="verdict">Verdict</option>
            <option value="recency">Most recent</option>
          </select>
        </label>
        <label className="text-xs text-tx3">
          <span className="block">Verdict</span>
          <select value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict | "all")} className={ctl}>
            <option value="all">All</option>
            <option value="pursue">Pursue</option>
            <option value="maybe">Maybe</option>
            <option value="skip">Skip</option>
          </select>
        </label>
        <label className="text-xs text-tx3">
          <span className="block">Company</span>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Stripe" className={ctl} />
        </label>
        <label className="text-xs text-tx3">
          <span className="block">Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Remote" className={ctl} />
        </label>
        <label className="flex min-h-9 items-center gap-1.5 text-xs text-tx2">
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
          Remote only
        </label>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="ml-auto min-h-9 rounded-md border border-bd px-3 text-xs text-tx2 hover:bg-surf2 disabled:opacity-50"
        >
          {refreshing ? "refreshing…" : "↻ refresh matches"}
        </button>
      </div>

      <p className="mt-3 text-xs text-tx3">
        {shown.length} shown{dismissedCount > 0 ? ` · ${dismissedCount} dismissed` : ""}
      </p>

      {/* Board */}
      {shown.length === 0 ? (
        <div className="mt-3 rounded-xl border border-bd bg-surf2 p-6 text-[15px] text-tx2">
          {rows.length === 0 ? (
            <>
              No matches yet.{" "}
              <a href="/onboarding" className="underline">Show RO your background</a> and it&apos;ll line
              up roles worth your time.
            </>
          ) : (
            <>Nothing matches these filters. Loosen them, or <button onClick={() => { setVerdict("all"); setCompany(""); setLocation(""); setRemoteOnly(false); }} className="underline">clear filters</button>.</>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {shown.map((r) => (
            <div key={r.role_id} className="rounded-lg border border-bd bg-surf p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-tx">
                    {r.title} <span className="text-tx3">· {r.company}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tx3">
                    {r.fit !== null && <span className="font-mono">fit {Math.round(r.fit)}</span>}
                    <span className={`rounded px-1.5 py-0.5 ${VERDICT_STYLE[r.verdict]}`}>{r.verdict}</span>
                    {r.location && <span>{r.location}</span>}
                    {r.status === "saved" && <span className="rounded bg-suc-bg px-1.5 py-0.5 text-suc">saved</span>}
                    {r.status === "pursuing" && <span className="rounded bg-info-bg px-1.5 py-0.5 text-info-tx">pursuing</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {r.status === "pursuing" ? (
                    <TailorButton roleId={r.role_id} />
                  ) : (
                    <button onClick={() => act(r.role_id, "pursue")} disabled={busy === r.role_id} className={btnPrimary}>
                      Pursue
                    </button>
                  )}
                  {r.status !== "saved" && (
                    <button onClick={() => act(r.role_id, "save")} disabled={busy === r.role_id} className={btn}>
                      Save
                    </button>
                  )}
                  <button onClick={() => act(r.role_id, "dismiss")} disabled={busy === r.role_id} className={btn}>
                    Dismiss
                  </button>
                </div>
              </div>

              {(r.why || r.gaps.length > 0) && (
                <>
                  <button
                    onClick={() => setExpanded(expanded === r.role_id ? null : r.role_id)}
                    aria-expanded={expanded === r.role_id}
                    className="mt-2 text-xs text-info-tx underline"
                  >
                    {expanded === r.role_id ? "hide why" : "why this fits"}
                  </button>
                  {expanded === r.role_id && (
                    <div className="mt-2 rounded-md bg-surf2 p-2 text-xs text-tx2">
                      {r.why && <p>{r.why}</p>}
                      {r.gaps.length > 0 && (
                        <p className="mt-1.5">
                          <span className="font-semibold">Gaps:</span> {r.gaps.join(" · ")}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ctl = "mt-0.5 min-h-9 rounded-md border border-bd bg-surf2 px-2 text-[13px] text-tx";
const btn = "min-h-9 rounded-md border border-bd px-2.5 text-xs text-tx hover:bg-surf2 disabled:opacity-50";
const btnPrimary = "min-h-9 rounded-md bg-info px-2.5 text-xs font-medium text-white disabled:opacity-50";

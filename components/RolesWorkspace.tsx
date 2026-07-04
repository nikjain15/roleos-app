"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TailorButton from "@/components/TailorButton";
import { curate, toggleCompare, type SortKey, type Verdict, type WorkspaceRole } from "@/lib/workspace";
import { parseWorkspaceParams } from "@/lib/dock-acts";

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

  // Filter-this-view (W3): the RO dock proposes a sanitized /roles?… link; when
  // the user clicks it the params land here and the board filters IN PLACE.
  const searchParams = useSearchParams();
  useEffect(() => {
    const { filters, sort: s } = parseWorkspaceParams(new URLSearchParams(searchParams.toString()));
    if (filters.verdict !== undefined) setVerdict(filters.verdict);
    if (filters.company !== undefined) setCompany(filters.company);
    if (filters.location !== undefined) setLocation(filters.location);
    if (filters.remoteOnly !== undefined) setRemoteOnly(filters.remoteOnly);
    if (s) setSort(s);
  }, [searchParams]);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // P1 (W4): compare selection (≤3), notes drafts, bulk-dismiss state.
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSaving, setNoteSaving] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

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
  const filtersActive = verdict !== "all" || company.trim() !== "" || location.trim() !== "" || remoteOnly;
  const compared = compareIds.map((id) => rows.find((r) => r.role_id === id)).filter((r): r is WorkspaceRole => !!r);

  async function saveNote(role_id: string) {
    const draft = (noteDrafts[role_id] ?? "").slice(0, 2000);
    setNoteSaving(role_id);
    try {
      const res = await fetch("/api/role-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: role_id, note: draft }),
      });
      if (res.ok) {
        setRows((rs) => rs.map((r) => (r.role_id === role_id ? { ...r, note: draft.trim() || null } : r)));
        setNoteDrafts((d) => {
          const { [role_id]: _gone, ...rest } = d;
          return rest;
        });
      }
    } finally {
      setNoteSaving(null);
    }
  }

  async function bulkDismiss() {
    const ids = shown.map((r) => r.role_id).slice(0, 100);
    if (ids.length === 0) return;
    setBulkBusy(true);
    setConfirmBulk(false);
    setRows((rs) => rs.map((r) => (ids.includes(r.role_id) ? { ...r, status: "dismissed" } : r))); // optimistic
    setCompareIds((sel) => sel.filter((id) => !ids.includes(id)));
    try {
      await fetch("/api/match/curate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_ids: ids, action: "dismiss" }),
      });
    } finally {
      setBulkBusy(false);
    }
  }

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

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="text-xs text-tx3">
          {shown.length} shown{dismissedCount > 0 ? ` · ${dismissedCount} dismissed` : ""}
        </p>
        {filtersActive && shown.length > 0 && !confirmBulk && (
          <button onClick={() => setConfirmBulk(true)} disabled={bulkBusy} className={btn}>
            Dismiss all {shown.length} shown
          </button>
        )}
        {confirmBulk && (
          <span className="flex items-center gap-2 text-xs text-tx2">
            Dismiss {Math.min(shown.length, 100)} roles from this filtered view?
            <button onClick={bulkDismiss} disabled={bulkBusy} className={btnPrimary}>
              {bulkBusy ? "Dismissing…" : "Yes, dismiss them"}
            </button>
            <button onClick={() => setConfirmBulk(false)} className={btn}>
              Keep them
            </button>
          </span>
        )}
        {compareIds.length >= 2 && (
          <button onClick={() => setComparing(true)} className={btnPrimary}>
            Compare {compareIds.length} side by side
          </button>
        )}
      </div>

      {/* Compare panel (P1): 2–3 roles side by side — fit, must-haves, gaps. */}
      {comparing && compared.length >= 2 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-bd bg-surf p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Side by side</h2>
            <button onClick={() => setComparing(false)} aria-label="Close comparison" className="text-tx3 hover:text-tx">
              ✕
            </button>
          </div>
          <div className={`mt-2 grid gap-3 ${compared.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {compared.map((r) => (
              <div key={r.role_id} className="rounded-lg border border-bd bg-surf2 p-3 text-xs">
                <p className="text-[13px] font-medium text-tx">{r.title}</p>
                <p className="text-tx3">{r.company}{r.location ? ` · ${r.location}` : ""}</p>
                <p className="mt-2">
                  {r.fit !== null && <span className="font-mono">fit {Math.round(r.fit)} · </span>}
                  <span className={`rounded px-1.5 py-0.5 ${VERDICT_STYLE[r.verdict]}`}>{r.verdict}</span>
                </p>
                {r.mustHaves.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold text-tx2">Must-haves</p>
                    <ul className="mt-1 list-disc pl-4 text-tx2">
                      {r.mustHaves.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.gaps.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold text-tx2">Your gaps</p>
                    <ul className="mt-1 list-disc pl-4 text-tx2">
                      {r.gaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.why && <p className="mt-2 text-tx2">{r.why}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

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
                    {r.fit !== null && (
                      <span className="font-mono">
                        fit {Math.round(r.fit)}
                        {r.fitAdjust && <> → {r.fitAdjust.adjusted}</>}
                      </span>
                    )}
                    {/* X4: outcome overlay — labelled, base fit stays visible above. */}
                    {r.fitAdjust && (
                      <span
                        className="rounded bg-info-bg px-1.5 py-0.5 text-info-tx"
                        title={r.fitAdjust.because.map((b) => `${b.feature} ${b.wins}/${b.n}`).join(" · ")}
                      >
                        {r.fitAdjust.delta > 0 ? "+" : ""}
                        {r.fitAdjust.delta} · your track record
                      </span>
                    )}
                    <span className={`rounded px-1.5 py-0.5 ${VERDICT_STYLE[r.verdict]}`}>{r.verdict}</span>
                    {r.location && <span>{r.location}</span>}
                    {r.status === "saved" && <span className="rounded bg-suc-bg px-1.5 py-0.5 text-suc">saved</span>}
                    {r.status === "pursuing" && <span className="rounded bg-info-bg px-1.5 py-0.5 text-info-tx">pursuing</span>}
                    {r.note && <span className="rounded bg-surf2 px-1.5 py-0.5" title={r.note}>📝 note</span>}
                    <label className="flex min-h-9 items-center gap-1 text-tx2">
                      <input
                        type="checkbox"
                        checked={compareIds.includes(r.role_id)}
                        disabled={!compareIds.includes(r.role_id) && compareIds.length >= 3}
                        onChange={() => setCompareIds((sel) => toggleCompare(sel, r.role_id))}
                      />
                      compare
                    </label>
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

              <button
                onClick={() => setExpanded(expanded === r.role_id ? null : r.role_id)}
                aria-expanded={expanded === r.role_id}
                className="mt-2 text-xs text-info-tx underline"
              >
                {expanded === r.role_id ? "hide details" : r.why || r.gaps.length > 0 ? "why this fits + notes" : "notes"}
              </button>
              {expanded === r.role_id && (
                <div className="mt-2 rounded-md bg-surf2 p-2 text-xs text-tx2">
                  {r.why && <p>{r.why}</p>}
                  {r.fitAdjust && (
                    <p className="mt-1.5">
                      <span className="font-semibold">Your track record:</span> fit adjusted{" "}
                      {r.fitAdjust.delta > 0 ? "+" : ""}
                      {r.fitAdjust.delta} because{" "}
                      {r.fitAdjust.because
                        .map((b) => `${b.feature} roles converted ${b.wins}/${b.n} for you`)
                        .join("; ")}
                      . RO&apos;s original read stays shown — this only reflects your real outcomes.
                    </p>
                  )}
                  {r.gaps.length > 0 && (
                    <p className="mt-1.5">
                      <span className="font-semibold">Gaps:</span> {r.gaps.join(" · ")}
                    </p>
                  )}
                  {/* P1 notes — private, RLS-scoped; empty save clears the note. */}
                  <label className="mt-2 block">
                    <span className="font-semibold">Your note</span>
                    <textarea
                      value={noteDrafts[r.role_id] ?? r.note ?? ""}
                      onChange={(e) => setNoteDrafts((d) => ({ ...d, [r.role_id]: e.target.value }))}
                      rows={2}
                      maxLength={2000}
                      placeholder="Private to you — contacts, comp intel, gut feel…"
                      className="mt-1 w-full rounded-md border border-bd bg-bg px-2 py-1.5 text-xs text-tx"
                    />
                  </label>
                  {noteDrafts[r.role_id] !== undefined && (noteDrafts[r.role_id] ?? "") !== (r.note ?? "") && (
                    <button onClick={() => saveNote(r.role_id)} disabled={noteSaving === r.role_id} className={`mt-1.5 ${btn}`}>
                      {noteSaving === r.role_id ? "Saving…" : "Save note"}
                    </button>
                  )}
                </div>
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

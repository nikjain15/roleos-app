"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * X6 — the user's own people, managed in the open. Upload THEIR LinkedIn
 * connections export (their data, via LinkedIn's own download — we never touch
 * LinkedIn), add the handful of people they'd actually ask by hand, and delete
 * everything in one click. Nothing here is ever contacted by RO — paths
 * surface on Apply; the user sends any ask themselves.
 */
export default function ConnectionsManager({ total }: { total: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"csv" | "manual" | "delete" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [manual, setManual] = useState({ name: "", company: "", title: "", note: "" });

  async function post(body: unknown, kind: "csv" | "manual") {
    setBusy(kind);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { added?: number; total?: number; error?: string };
      if (res.ok) {
        setMsg(`Added ${j.added} ${j.added === 1 ? "person" : "people"} — ${j.total} total.`);
        setManual({ name: "", company: "", title: "", note: "" });
        router.refresh();
      } else {
        setErr(j.error ?? "Couldn't save.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File) {
    const text = await file.text();
    await post({ csv: text }, "csv");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function deleteAll() {
    setBusy("delete");
    setErr(null);
    try {
      const res = await fetch("/api/connections", { method: "DELETE" });
      if (res.ok) {
        setMsg("All connections deleted.");
        setConfirming(false);
        router.refresh();
      } else {
        setErr("Couldn't delete — try again.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section aria-label="Upload your LinkedIn export" className="rounded-xl border border-bd bg-surf p-4">
        <h2 className="text-sm font-semibold">Upload your LinkedIn connections</h2>
        <p className="mt-1 text-xs text-tx2">
          LinkedIn → Settings → Data privacy → &ldquo;Get a copy of your data&rdquo; → Connections. That CSV is
          yours; upload it here. I never touch LinkedIn — and these people are only ever shown to you.
        </p>
        <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center rounded-md border border-bd px-3 text-xs font-medium text-tx2 hover:bg-surf2">
          {busy === "csv" ? "Uploading…" : "Choose Connections.csv"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={busy !== null}
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
      </section>

      <section aria-label="Add a person by hand" className="rounded-xl border border-bd bg-surf p-4">
        <h2 className="text-sm font-semibold">Add someone you&apos;d actually ask</h2>
        <p className="mt-1 text-xs text-tx2">
          The note is what makes the ask honest — how you actually know them. I&apos;ll never invent more.
        </p>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.name.trim()) void post({ manual }, "manual");
          }}
        >
          <label className="text-xs text-tx2">
            Name (required)
            <input
              value={manual.name}
              onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
              maxLength={200}
              required
              className="mt-1 w-full rounded-md border border-bd bg-bg px-2 py-1.5 text-sm text-tx"
            />
          </label>
          <label className="text-xs text-tx2">
            Company
            <input
              value={manual.company}
              onChange={(e) => setManual((m) => ({ ...m, company: e.target.value }))}
              maxLength={200}
              className="mt-1 w-full rounded-md border border-bd bg-bg px-2 py-1.5 text-sm text-tx"
            />
          </label>
          <label className="text-xs text-tx2">
            Title
            <input
              value={manual.title}
              onChange={(e) => setManual((m) => ({ ...m, title: e.target.value }))}
              maxLength={200}
              className="mt-1 w-full rounded-md border border-bd bg-bg px-2 py-1.5 text-sm text-tx"
            />
          </label>
          <label className="text-xs text-tx2 sm:col-span-2">
            How you know them
            <input
              value={manual.note}
              onChange={(e) => setManual((m) => ({ ...m, note: e.target.value }))}
              maxLength={2000}
              placeholder="e.g. worked together at Beam 2019-21; she reviewed my PM promo packet"
              className="mt-1 w-full rounded-md border border-bd bg-bg px-2 py-1.5 text-sm text-tx"
            />
          </label>
          <div>
            <button
              type="submit"
              disabled={busy !== null || !manual.name.trim()}
              className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "manual" ? "Adding…" : "Add person"}
            </button>
          </div>
        </form>
      </section>

      {total > 0 && (
        <section aria-label="Delete all connections" className="rounded-xl border border-bd bg-surf p-4">
          <h2 className="text-sm font-semibold">Your data, your call</h2>
          <p className="mt-1 text-xs text-tx2">
            One click removes every connection ({total}) from RoleOS. Nothing is retained.
          </p>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="mt-3 min-h-10 rounded-md border border-dng px-3 text-xs font-medium text-dng"
            >
              Delete all my connections
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={deleteAll}
                disabled={busy !== null}
                className="min-h-10 rounded-md bg-dng px-3 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy === "delete" ? "Deleting…" : `Yes — delete all ${total}`}
              </button>
              <button onClick={() => setConfirming(false)} className="min-h-10 rounded-md border border-bd px-3 text-xs text-tx2">
                Keep them
              </button>
            </div>
          )}
        </section>
      )}

      {msg && <p className="text-xs text-suc">{msg}</p>}
      {err && (
        <p role="alert" className="text-xs text-dng">
          {err}
        </p>
      )}
    </div>
  );
}

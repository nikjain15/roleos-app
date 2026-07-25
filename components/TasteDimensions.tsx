"use client";

import { useEffect, useState } from "react";

/**
 * "How RO is learning you" (Slice 8) — the 15-dimension model, transparent and
 * correctable (goal-engine §7). Shows each dimension's inference + confidence, and
 * lets the user confirm or correct it (their words win). RLS-scoped via /api/taste.
 */
interface Dim {
  id: number;
  key: string;
  label: string;
  group: string;
  inference: string | null;
  confidence: number;
  basis: string;
  userConfirmed: boolean;
  userNote: string | null;
}

const GROUP_LABEL: Record<string, string> = {
  fit: "Fit", craft: "Craft", voice: "Voice", cadence: "Cadence", plan: "Plan",
};

export default function TasteDimensions() {
  const [dims, setDims] = useState<Dim[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/taste")
      .then((r) => (r.ok ? r.json() : { dimensions: [] }))
      .then((d: { dimensions?: Dim[] }) => setDims(d.dimensions ?? []))
      .catch(() => setDims([]));
  }, []);

  async function save(dimension: number, confirmed: boolean, user_note: string | null) {
    setBusy(true);
    try {
      await fetch("/api/taste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimension, confirmed, user_note }),
      });
      // reflect locally
      setDims((ds) =>
        (ds ?? []).map((d) =>
          d.id === dimension
            ? { ...d, userConfirmed: confirmed, userNote: user_note, inference: confirmed ? user_note ?? d.inference : d.inference, confidence: confirmed ? 0.95 : d.confidence }
            : d,
        ),
      );
      setEditing(null);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  if (!dims) return <p className="mt-3 text-[13px] text-tx3">Loading how RO sees you…</p>;

  const groups = ["fit", "craft", "voice", "cadence", "plan"];

  return (
    <div className="mt-4 space-y-5">
      <p className="text-[13px] text-tx2">
        RO learns your taste from what you do — never guessing when it hasn&apos;t seen enough. Correct
        anything; your words win.
      </p>
      {groups.map((g) => {
        const inGroup = dims.filter((d) => d.group === g);
        if (!inGroup.length) return null;
        return (
          <section key={g} aria-label={GROUP_LABEL[g]}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">{GROUP_LABEL[g]}</h3>
            <div className="mt-2 space-y-2">
              {inGroup.map((d) => (
                <div key={d.id} className="rounded-lg border border-bd bg-surf p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-tx">{d.label}</p>
                      <p className="mt-0.5 text-[13px] text-tx2">
                        {d.inference ?? <span className="text-tx3">Still learning — {d.basis}</span>}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <ConfidenceBar value={d.confidence} confirmed={d.userConfirmed} />
                      <button
                        onClick={() => {
                          setEditing(editing === d.id ? null : d.id);
                          setNote(d.userNote ?? (d.inference ?? ""));
                        }}
                        className="text-[11px] text-info-tx underline"
                      >
                        {d.userConfirmed ? "edit" : "correct"}
                      </button>
                    </div>
                  </div>

                  {editing === d.id && (
                    <div className="mt-2 border-t border-bd pt-2">
                      <label className="sr-only" htmlFor={`note-${d.id}`}>Your take on {d.label}</label>
                      <textarea
                        id={`note-${d.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Tell RO how it actually is…"
                        className="w-full rounded-md border border-bd bg-surf2 p-2 text-[13px] text-tx"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => save(d.id, true, note.trim() || null)}
                          disabled={busy}
                          className="min-h-9 rounded-md bg-primary px-3 text-xs font-medium text-white disabled:opacity-50"
                        >
                          This is me
                        </button>
                        {d.userConfirmed && (
                          <button
                            onClick={() => save(d.id, false, null)}
                            disabled={busy}
                            className="min-h-9 rounded-md border border-bd px-3 text-xs text-tx2"
                          >
                            Let RO relearn it
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ConfidenceBar({ value, confirmed }: { value: number; confirmed: boolean }) {
  return (
    <span className="flex items-center gap-1" title={`${Math.round(value * 100)}% confident`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surf2">
        <span
          className={`block h-full ${confirmed ? "bg-suc" : "bg-primary"}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
      <span className="text-[10px] text-tx3">{confirmed ? "you" : `${Math.round(value * 100)}%`}</span>
    </span>
  );
}

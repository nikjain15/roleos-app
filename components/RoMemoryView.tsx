"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";

/**
 * "What RO remembers" (RO memory M1c). The user's own notebook, visible and
 * correctable — the trust + privacy control for Option B. RO shows each note it
 * learned; the user can fix the wording or forget it entirely. Mirrors the
 * correctable ProfileView. Every change is RLS-scoped (their notes only).
 */
export interface MemoryNote {
  id: string;
  kind: string;
  text: string;
  scope: string;
}

const KIND_TONE: Record<string, "primary" | "info" | "suc" | "warn" | "neutral"> = {
  target: "primary",
  identity: "info",
  style: "suc",
  preference: "neutral",
  correction: "warn",
};

export default function RoMemoryView({ initialNotes }: { initialNotes: MemoryNote[] }) {
  const [notes, setNotes] = useState<MemoryNote[]>(initialNotes);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function save(id: string) {
    if (!draft.trim() || busy) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/ro/memory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft.trim() }),
      });
      if (res.ok) {
        setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, text: draft.trim() } : n)));
        setEditing(null);
      }
    } finally {
      setBusy(null);
    }
  }

  async function forget(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/ro/memory/${id}`, { method: "DELETE" });
      if (res.ok) setNotes((ns) => ns.filter((n) => n.id !== id));
    } finally {
      setBusy(null);
    }
  }

  if (notes.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-bd bg-surf p-5 text-body text-tx2">
        RO hasn&rsquo;t noted anything about you yet. As you correct your profile, tune résumés, and make
        choices, RO jots down a few lasting facts here — and you can always fix or forget them.
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-2">
      {notes.map((n) => (
        <li key={n.id} className="rounded-xl border border-bd bg-surf p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Badge tone={KIND_TONE[n.kind] ?? "neutral"}>{n.kind}</Badge>
              {editing === n.id ? (
                <div className="mt-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    className="w-full resize-y rounded-md border border-bd bg-surf2 p-2 text-body text-tx"
                  />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => save(n.id)} disabled={busy === n.id} className="rounded-md bg-primary px-3 py-1.5 text-small font-medium text-white disabled:opacity-50">
                      {busy === n.id ? "saving…" : "save"}
                    </button>
                    <button onClick={() => setEditing(null)} className="rounded-md border border-bd px-3 py-1.5 text-small text-tx hover:bg-surf2">
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-body leading-relaxed text-tx">{n.text}</p>
              )}
            </div>
            {editing !== n.id && (
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => {
                    setEditing(n.id);
                    setDraft(n.text);
                  }}
                  className="text-small text-tx3 hover:text-tx2"
                >
                  edit
                </button>
                <button onClick={() => forget(n.id)} disabled={busy === n.id} className="text-small text-tx3 hover:text-dng-tx disabled:opacity-50">
                  forget
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

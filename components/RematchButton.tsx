"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Refresh my matches" — re-runs matching for the signed-in user against the
 * current role pool + pipeline (POST /api/rematch, RLS-scoped). This is how a
 * user whose shortlist was frozen at onboarding picks up newly-ingested roles
 * and recall improvements, on demand. RO recommends; the user decides — so the
 * refresh is theirs to trigger.
 */
export default function RematchButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/rematch", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; pursue?: number; saved?: number; error?: string };
      if (res.ok && data.ok) {
        setNote(
          data.pursue
            ? `Refreshed — ${data.pursue} worth pursuing now.`
            : `Refreshed ${data.saved ?? 0} matches.`,
        );
        router.refresh();
      } else {
        setNote("Couldn't refresh just now — try again in a moment.");
      }
    } catch {
      setNote("Couldn't refresh just now — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={refresh}
        disabled={busy}
        className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2 hover:border-info disabled:opacity-50"
      >
        {busy ? "Refreshing…" : "Refresh my matches →"}
      </button>
      {note && <span className="text-xs text-tx3">{note}</span>}
    </span>
  );
}

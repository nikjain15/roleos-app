"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The user's decision on a tailored artifact. "Make it mine" = approve, "Not
 * this one" = reject. Each writes an append-only decision_event and updates the
 * taste model. Sending stays human-gated and separate (the dispatch route) —
 * RO never sends; the user does.
 */
export default function ArtifactActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState<{ action: string; tasteUpdated: number } | null>(null);

  async function decide(action: "approve" | "reject") {
    if (busy) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/artifact/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json()) as { tasteUpdated?: number };
      setDone({ action, tasteUpdated: j.tasteUpdated ?? 0 });
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="mt-8 rounded-xl border border-bd bg-surf2 p-5">
        {done.action === "approve" ? (
          <>
            <p className="text-[15px] text-tx">
              Made it yours. It&apos;s ready when you are — you press send (nothing leaves the building
              without your click).
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                disabled
                className="rounded-md bg-info px-4 py-2 text-sm font-medium text-white opacity-50"
                title="Sending is the separate, user-clicked dispatch — wired next."
              >
                Send it ↗
              </button>
              <button onClick={() => router.push("/feed")} className="text-sm text-tx3 underline">
                back to feed
              </button>
            </div>
          </>
        ) : (
          <p className="text-[15px] text-tx">
            Scratched that one. Noted — that&apos;s how I get sharper.{" "}
            <button onClick={() => router.push("/feed")} className="underline">
              back to feed
            </button>
          </p>
        )}
        {done.tasteUpdated > 0 && (
          <p className="mt-3 text-xs text-suc">
            ✓ I learned something about you — your taste model just got sharper ({done.tasteUpdated}{" "}
            {done.tasteUpdated === 1 ? "read" : "reads"} updated).
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-8 flex items-center gap-3">
      <button
        onClick={() => decide("approve")}
        disabled={busy !== null || status === "approved"}
        className="rounded-md bg-info px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy === "approve" ? "Saving…" : "Make it mine"}
      </button>
      <button
        onClick={() => decide("reject")}
        disabled={busy !== null}
        className="rounded-md border border-bd px-4 py-2 text-sm text-tx2 disabled:opacity-50"
      >
        {busy === "reject" ? "…" : "Not this one"}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Recovery for a résumé artifact that came back without a usable body (the
 * drafter's output couldn't be shaped even after repair). Rather than show the
 * user a blank page, RO owns it and offers to run it again — human-gated, honest.
 */
export default function RegenerateResume({ roleId }: { roleId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function regenerate() {
    if (busy || !roleId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const j = (await res.json()) as { artifactId?: string; error?: string };
      if (j.artifactId) router.push(`/studio/resume/${j.artifactId}`);
      else setErr(j.error ?? "That didn't take — try once more.");
    } catch {
      setErr("Network hiccup — try once more.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-bd bg-surf2 p-5">
      <p className="text-[15px] text-tx">
        I couldn&apos;t shape this draft cleanly, so I&apos;m not going to show you a half-finished
        résumé and call it done. Let me run it again.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={regenerate}
          disabled={busy || !roleId}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Redrafting…" : "Redraft it"}
        </button>
        <button onClick={() => router.push("/feed")} className="text-sm text-tx3 underline">
          back to feed
        </button>
      </div>
      {err && <p className="mt-3 text-xs text-warn">{err}</p>}
    </div>
  );
}

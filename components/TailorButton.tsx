"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Feed → Gate 1. Asks RO to tailor a résumé for this role, then opens the studio.
 * Tailoring is ASYNC now: this returns a `drafting` placeholder instantly and
 * navigates straight to the studio, where RO's progress shows live and the résumé
 * fills in when ready — no more waiting on a spinning button. RO drafts; the user
 * reviews + sends (human-gated outward).
 */
export default function TailorButton({ roleId }: { roleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function tailor() {
    if (busy) return;
    setBusy(true);
    setErr(false);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const j = (await res.json()) as { artifactId?: string; error?: string };
      if (j.artifactId) router.push(`/studio/resume/${j.artifactId}`);
      else setErr(true);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={tailor}
      disabled={busy}
      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-70"
    >
      {busy ? "Opening…" : err ? "Try again" : "Tailor my résumé →"}
    </button>
  );
}

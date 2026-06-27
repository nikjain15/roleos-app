"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Feed → Gate 1. Asks RO to tailor a résumé for this role, then opens the studio.
 * RO drafts; the user reviews + sends (human-gated outward).
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
      className="rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
    >
      {busy ? "RO is tailoring…" : err ? "Try again" : "Tailor my résumé →"}
    </button>
  );
}

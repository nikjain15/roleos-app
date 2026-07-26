"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Feed → Gate 1. Asks RO to tailor a résumé for this role, then opens the studio.
 * RO drafts; the user reviews + sends (human-gated outward).
 *
 * Tailoring is a multi-minute model job (draft + truth-gate + revise); the route
 * runs at maxDuration=300. While it works we cycle honest progress copy so the
 * long wait reads as "RO is working," not "stuck" — the button was previously a
 * dead "RO is tailoring…" for the whole draft.
 */
const STAGES = [
  "RO is reading the posting…",
  "Mapping your experience to it…",
  "Tailoring your résumé…",
  "Truth-checking every line…",
  "Almost there…",
];

export default function TailorButton({ roleId }: { roleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [stage, setStage] = useState(0);

  // Advance the progress copy every ~12s while drafting (caps at the last stage).
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 12_000);
    return () => clearInterval(t);
  }, [busy]);

  async function tailor() {
    if (busy) return;
    setBusy(true);
    setErr(false);
    setStage(0);
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
      aria-live="polite"
      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-70"
    >
      {busy ? STAGES[stage] : err ? "Try again" : "Tailor my résumé →"}
    </button>
  );
}

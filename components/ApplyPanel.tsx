"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplyBundle } from "@/lib/apply";

/**
 * Apply panel (Slice 4). Presents the composed bundle + pre-filled compose/ATS
 * links, then lets the user confirm they applied. RO performs NO send — the honest
 * copy says so; the user opens their application, submits it there, then marks it
 * here so the tracker + pace engine see a real send. a11y: labelled, ≥40px targets.
 */
export default function ApplyPanel({
  artifactId,
  bundle,
  roleLabel,
}: {
  artifactId: string;
  bundle: ApplyBundle;
  roleLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function markApplied() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        router.push("/tracker");
        router.refresh();
      } else {
        setErr(j.error ?? "Couldn't record that.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function copyNote() {
    try {
      await navigator.clipboard.writeText(bundle.note);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; the note is visible to copy manually */
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <p className="rounded-lg border-l-[3px] border-primary bg-info-bg p-3 text-[13px] text-info-tx">
        RO never sends — you do. Open your application, submit it there, then mark it applied so I
        can track your pace.
      </p>

      {/* Step 1 — open the application */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
          1 · Open your application
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {bundle.atsUrl && (
            <a
              href={bundle.atsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-white"
            >
              Open the application (company site) ↗
            </a>
          )}
          <a
            href={bundle.gmailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center rounded-md border border-bd px-4 text-sm text-tx hover:bg-surf2"
          >
            Compose in Gmail ↗
          </a>
        </div>
      </section>

      {/* Step 2 — the composed note */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
            2 · Your note ({bundle.subject})
          </h2>
          <button onClick={copyNote} className="text-xs text-tx3 underline">
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-bd bg-surf2 p-3 text-[13px] leading-relaxed text-tx">
          {bundle.note}
        </pre>
        <p className="mt-1 text-xs text-tx3">Attach your exported résumé (DOCX/PDF) before sending.</p>
      </section>

      {/* Step 3 — confirm */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
          3 · Track it
        </h2>
        {err && <p className="mt-2 text-sm text-dng">{err}</p>}
        <button
          onClick={markApplied}
          disabled={busy}
          className="mt-2 min-h-11 w-full rounded-md bg-suc px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Recording…" : `I've applied to ${roleLabel} → track it`}
        </button>
      </section>
    </div>
  );
}

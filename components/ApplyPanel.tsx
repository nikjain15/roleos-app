"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplyBundle } from "@/lib/apply";

/**
 * Apply panel (Slice 4 + the Apply kit). Presents the composed bundle +
 * pre-filled compose/ATS links AND the files themselves (résumé + approved
 * cover letter as ATS DOCX / print-PDF), then lets the user confirm they
 * applied. RO performs NO send — the honest copy says so; the user opens their
 * application, submits it there, then marks it here so the tracker + pace
 * engine see a real send. a11y: labelled, ≥40px targets.
 */
export default function ApplyPanel({
  artifactId,
  coverId,
  bundle,
  roleLabel,
}: {
  artifactId: string;
  /** The APPROVED cover artifact, when one exists — enables its downloads. */
  coverId?: string | null;
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

      {/* Step 2 — the files (the Apply kit): ATS DOCX + print-PDF, ready to upload */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
          2 · Your files — download, then upload on their form
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={`/api/artifact/${artifactId}/export?format=docx`}
            className="flex min-h-11 items-center rounded-md border border-bd px-4 text-sm text-tx hover:bg-surf2"
          >
            Résumé · DOCX ↓
          </a>
          <a
            href={`/studio/resume/${artifactId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center rounded-md border border-bd px-4 text-sm text-tx hover:bg-surf2"
          >
            Résumé · PDF ↗
          </a>
          {coverId && (
            <>
              <a
                href={`/api/artifact/${coverId}/export?format=docx`}
                className="flex min-h-11 items-center rounded-md border border-bd px-4 text-sm text-tx hover:bg-surf2"
              >
                Cover letter · DOCX ↓
              </a>
              <a
                href={`/studio/cover/${coverId}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center rounded-md border border-bd px-4 text-sm text-tx hover:bg-surf2"
              >
                Cover letter · PDF ↗
              </a>
            </>
          )}
        </div>
        {!coverId && (
          <p className="mt-1 text-xs text-tx3">
            No approved cover letter yet — approve one above and its files appear here.
          </p>
        )}
      </section>

      {/* Step 3 — the composed note */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
            3 · Your note ({bundle.subject})
          </h2>
          <button onClick={copyNote} className="text-xs text-tx3 underline">
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-bd bg-surf2 p-3 text-[13px] leading-relaxed text-tx">
          {bundle.note}
        </pre>
      </section>

      {/* Step 4 — confirm */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
          4 · Track it
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

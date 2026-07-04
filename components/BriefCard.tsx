"use client";

import { useState } from "react";

/**
 * X2 — company brief on the Apply page. Click-to-generate (the user's gesture
 * = the model call); grounded in RO's stored data only, with honest unknowns.
 */
export interface CompanyBriefView {
  overview: string;
  hiring_signal: string;
  what_they_value: string[];
  comp_read: string;
  prep_pointers: string[];
  unknowns: string[];
  company: string;
}

export default function BriefCard({ roleId, company, initial }: { roleId: string; company: string; initial: CompanyBriefView | null }) {
  const [brief, setBrief] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const j = (await res.json()) as { brief?: CompanyBriefView; error?: string };
      if (res.ok && j.brief) setBrief(j.brief);
      else setErr(j.error ?? "Couldn't build the brief.");
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-bd bg-surf p-4" aria-label="Company brief">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Know {company} before you send</h2>
        <button onClick={run} disabled={busy} className="min-h-9 rounded-md border border-bd px-2.5 text-xs text-tx2 disabled:opacity-50">
          {busy ? "Reading…" : brief ? "Refresh brief" : "Brief me"}
        </button>
      </div>

      {!brief && !busy && (
        <p className="mt-2 text-[13px] text-tx2">
          RO assembles the two-minute read from every posting it&apos;s stored at {company} — hiring
          signal, what they value, comp honesty — and tells you plainly what it doesn&apos;t know.
        </p>
      )}

      {brief && (
        <div className="mt-3 space-y-3 text-[13px] text-tx2">
          <p>{brief.overview}</p>
          {brief.hiring_signal && (
            <p>
              <span className="font-semibold text-tx">Hiring signal:</span> {brief.hiring_signal}
            </p>
          )}
          {brief.what_they_value.length > 0 && (
            <p>
              <span className="font-semibold text-tx">They keep asking for:</span> {brief.what_they_value.join(" · ")}
            </p>
          )}
          {brief.comp_read && (
            <p>
              <span className="font-semibold text-tx">Comp:</span> {brief.comp_read}
            </p>
          )}
          {brief.prep_pointers.length > 0 && (
            <div>
              <p className="font-semibold text-tx">Prep for this role</p>
              <ul className="mt-1 list-disc pl-5">
                {brief.prep_pointers.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {brief.unknowns.length > 0 && (
            <div className="rounded-md bg-surf2 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">What I can&apos;t tell you from my data</p>
              <ul className="mt-1 list-disc pl-5 text-tx3">
                {brief.unknowns.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {err && (
        <p className="mt-2 text-[13px] text-dng" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}

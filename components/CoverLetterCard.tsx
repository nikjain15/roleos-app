"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Cover-letter step on the Apply page (slice W2). Lets the user draft a REAL,
 * truth-gated cover letter for this role, review any truth flags honestly,
 * edit the text, and approve it — at which point the apply bundle uses it
 * instead of the template. Human-gated: drafting is a user click, approving is
 * a user click, and nothing here sends anything.
 */
export interface CoverArtifact {
  id: string;
  status: string;
  subject: string;
  body: string;
  angle: string | null;
  truthFlags: string[];
}

export default function CoverLetterCard({ roleId, cover }: { roleId: string; cover: CoverArtifact | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"draft" | "approve" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(cover?.body ?? "");
  const [subject, setSubject] = useState(cover?.subject ?? "");

  async function draft() {
    setBusy("draft");
    setErr(null);
    try {
      const res = await fetch("/api/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const j = (await res.json()) as { artifactId?: string; error?: string };
      if (res.ok && j.artifactId) {
        router.refresh();
      } else {
        setErr(j.error ?? "Couldn't draft the letter.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!cover) return;
    setBusy("approve");
    setErr(null);
    try {
      const changed = body.trim() !== cover.body.trim() || subject.trim() !== cover.subject.trim();
      const res = await fetch(`/api/artifact/${cover.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          changed
            ? { action: "edit", edited: { subject: subject.trim(), body: body.trim(), angle: cover.angle } }
            : { action: "approve" },
        ),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setErr(j.error ?? "Couldn't save that.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-bd bg-surf p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Cover letter</h2>
        {cover?.status === "approved" && !editing && (
          <span className="rounded bg-suc-bg px-1.5 py-0.5 text-[10px] text-suc">approved · in your note</span>
        )}
      </div>

      {!cover ? (
        <>
          <p className="mt-2 text-[13px] text-tx2">
            Your note below is a clean template. I can draft a real letter for this role from your
            profile — truth-gated, and you approve it before it goes anywhere.
          </p>
          <button
            onClick={draft}
            disabled={busy === "draft"}
            className="mt-3 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy === "draft" ? "Drafting…" : "Draft my cover letter"}
          </button>
        </>
      ) : (
        <>
          {cover.truthFlags.length > 0 && (
            <div className="mt-3 rounded-lg border-l-[3px] border-warn bg-warn-bg p-3 text-[13px] text-warn">
              <p className="font-semibold">Check these before you approve:</p>
              <ul className="mt-1 list-disc pl-5">
                {cover.truthFlags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {cover.angle && <p className="mt-2 text-xs text-tx3">Angle: {cover.angle}</p>}

          {editing || cover.status !== "approved" ? (
            <div className="mt-3 space-y-3">
              <label className="block text-xs text-tx2">
                Subject
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-md border border-bd bg-bg px-3 py-2 text-sm text-tx"
                />
              </label>
              <label className="block text-xs text-tx2">
                Letter — make it yours
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="mt-1 w-full rounded-md border border-bd bg-bg px-3 py-2 text-sm leading-relaxed text-tx"
                />
              </label>
              <button
                onClick={approve}
                disabled={busy === "approve" || body.trim().length < 40}
                className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy === "approve" ? "Saving…" : "Approve — use this letter"}
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <p className="whitespace-pre-wrap rounded-lg bg-surf2 p-3 text-[13px] leading-relaxed text-tx2">{cover.body}</p>
              <button onClick={() => setEditing(true)} className="mt-2 min-h-10 rounded-md border border-bd px-3 text-sm text-tx2">
                Edit the letter
              </button>
            </div>
          )}
        </>
      )}

      {err && (
        <p className="mt-3 text-[13px] text-dng" role="alert">
          {err} <button onClick={() => setErr(null)} className="underline">dismiss</button>
        </p>
      )}
    </section>
  );
}

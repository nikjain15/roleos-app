"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReasonOption } from "@/lib/rejection-growth";

/**
 * X11 — the reflection's reason picker. Entirely optional: capturing a reason is
 * how RO sharpens the next match, but skipping is one click and costs nothing.
 * No streak, no nag. Recording a reason never sends or changes anything.
 */
export default function ReflectionClient({
  applicationId,
  reasonOptions,
  savedReason,
}: {
  applicationId: string;
  reasonOptions: ReasonOption[];
  savedReason: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(savedReason);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!reason || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, reason, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(true);
    } catch {
      setErr("Couldn't save that just now — it's fine to skip; it won't hold anything up.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <section className="mt-5 rounded-xl border border-suc bg-suc-bg p-5" aria-live="polite">
        <p className="text-[14px] font-medium text-suc">
          Noted — that sharpens what I look for next. Thanks for taking the minute.
        </p>
        <button
          onClick={() => router.push("/tracker")}
          className="mt-3 min-h-10 rounded-md bg-info px-4 text-sm font-medium text-white"
        >
          Back to the tracker
        </button>
      </section>
    );
  }

  return (
    <section className="mt-5 rounded-xl border border-bd bg-surf2 p-5" aria-label="Optional reason">
      <p className="text-[14px] font-medium text-tx">If you know why it ended, one tap helps me learn</p>
      <p className="mt-0.5 text-[12px] text-tx3">Totally optional — skip it and nothing changes.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {reasonOptions.map((o) => (
          <button
            key={o.value}
            onClick={() => setReason(o.value)}
            aria-pressed={reason === o.value}
            className={`min-h-10 rounded-md border px-3 text-sm ${
              reason === o.value ? "border-info bg-info-bg text-info-tx" : "border-bd text-tx2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {reason && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Anything you want to remember about this one (optional)"
          className="mt-3 w-full rounded-lg border border-bd bg-surf p-3 text-[14px] text-tx"
        />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={!reason || busy}
          className="min-h-10 rounded-md bg-info px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save reason"}
        </button>
        <button
          onClick={() => router.push("/tracker")}
          className="min-h-10 rounded-md border border-bd px-4 text-sm text-tx2"
        >
          Skip — back to tracker
        </button>
      </div>
      {err && (
        <p role="alert" className="mt-2 text-xs text-dng">
          {err}
        </p>
      )}
    </section>
  );
}

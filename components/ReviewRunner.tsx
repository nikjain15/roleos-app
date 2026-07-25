"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
/**
 * X7 — runs and renders the weekly review. The run is the user's click;
 * pivots are proposals that LINK to /goal and /roles — nothing auto-applies.
 */
export interface WeeklyReview {
  headline: string;
  pace_read: string;
  working: string[];
  not_working: string[];
  pivots: Array<{ change: string; why: string }>;
  next_week: string[];
  wellbeing_note: string;
}

export default function ReviewRunner({
  initial,
  generatedAt,
}: {
  initial: (WeeklyReview & { week_of?: string }) | null;
  generatedAt: string | null;
}) {
  const router = useRouter();
  const [review, setReview] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/review", { method: "POST" });
      const j = (await res.json()) as { review?: WeeklyReview | null; message?: string; error?: string };
      if (!res.ok) setErr(j.error ?? "Couldn't run the review.");
      else if (!j.review) setMsg(j.message ?? "Not enough signal yet.");
      else {
        setReview(j.review);
        router.refresh();
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={busy} className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "RO's reviewing your week…" : review ? "Run a fresh review" : "Run my weekly review"}
        </button>
        {generatedAt && <span className="text-xs text-tx3">last run {generatedAt.slice(0, 10)}</span>}
      </div>

      {msg && <p className="mt-4 rounded-lg border border-bd bg-surf2 p-4 text-[14px] text-tx2">{msg}</p>}
      {err && (
        <p className="mt-4 text-[14px] text-dng" role="alert">
          {err}
        </p>
      )}

      {!review && !msg && (
        <div className="mt-6 rounded-xl border border-bd bg-surf2 p-6 text-[15px] text-tx2">
          No review yet. Run one after a week of real activity — sends, stage moves, curation —
          and RO will give you the honest read.
        </div>
      )}

      {review && (
        <article className="mt-6 space-y-5">
          <header className="rounded-xl border border-bd bg-surf p-4">
            <h2 className="text-lg font-semibold text-tx">{review.headline}</h2>
            <p className="mt-1.5 text-[14px] text-tx2">{review.pace_read}</p>
            {review.wellbeing_note && <p className="mt-2 text-[13px] italic text-tx3">{review.wellbeing_note}</p>}
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-xl border border-bd bg-surf p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-suc">Working</h3>
              <ul className="mt-2 list-disc pl-5 text-[13px] text-tx2">
                {review.working.length ? review.working.map((w, i) => <li key={i}>{w}</li>) : <li>Nothing conclusive yet.</li>}
              </ul>
            </section>
            <section className="rounded-xl border border-bd bg-surf p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-warn">Not working</h3>
              <ul className="mt-2 list-disc pl-5 text-[13px] text-tx2">
                {review.not_working.length ? review.not_working.map((w, i) => <li key={i}>{w}</li>) : <li>No red flags this week.</li>}
              </ul>
            </section>
          </div>

          {review.pivots.length > 0 && (
            <section className="rounded-xl border-l-[3px] border-primary bg-info-bg p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-info-tx">Pivots worth making</h3>
              <ul className="mt-2 space-y-2 text-[13px] text-tx2">
                {review.pivots.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium text-tx">{p.change}</span> — {p.why}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-tx3">
                Your call, not mine — adjust at <Link href="/goal" className="underline">your goal</Link> or{" "}
                <Link href="/roles" className="underline">your shortlist</Link>.
              </p>
            </section>
          )}

          <section className="rounded-xl border border-bd bg-surf p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Next week</h3>
            <ol className="mt-2 list-decimal pl-5 text-[13px] text-tx2">
              {review.next_week.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
          </section>
        </article>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * X3 — pre-send quality score on the Apply page. The user clicks to score
 * (their gesture = the model call); RO returns an honest screen-likelihood
 * read with concrete fixes. A low score warns — applying is never blocked.
 */
export interface AppScore {
  score: number;
  screen_likelihood: string;
  strengths: string[];
  weak_spots: Array<{ issue?: string; fix?: string }>;
  note: string;
  scored_at?: string;
}

const LIKELIHOOD_STYLE: Record<string, string> = {
  high: "bg-suc-bg text-suc",
  medium: "bg-info-bg text-info-tx",
  low: "bg-warn-bg text-warn",
};

export default function ApplyScoreCard({ artifactId, initial }: { artifactId: string; initial: AppScore | null }) {
  const router = useRouter();
  const [score, setScore] = useState<AppScore | null>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/apply-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId }),
      });
      const j = (await res.json()) as { app_score?: AppScore; error?: string };
      if (res.ok && j.app_score) {
        setScore(j.app_score);
        router.refresh();
      } else {
        setErr(j.error ?? "Couldn't score that one.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-bd bg-surf p-4" aria-label="Application quality score">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
          How strong is this application?
        </h2>
        <button onClick={run} disabled={busy} className="min-h-9 rounded-md border border-bd px-2.5 text-xs text-tx2 disabled:opacity-50">
          {busy ? "Scoring…" : score ? "Re-score" : "Score it before you send"}
        </button>
      </div>

      {!score && !busy && (
        <p className="mt-2 text-[13px] text-tx2">
          RO reads this résumé against the role&apos;s must-haves and gives you a candid
          screen-likelihood read — with the fixes, while they&apos;re still two minutes of work.
        </p>
      )}

      {score && (
        <div className="mt-3">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xl font-bold text-tx">{score.score}</span>
            <span className="text-xs text-tx3">/ 100</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${LIKELIHOOD_STYLE[score.screen_likelihood] ?? "bg-surf2 text-tx3"}`}>
              {score.screen_likelihood} screen likelihood
            </span>
          </p>
          {score.note && <p className="mt-2 text-[13px] text-tx2">{score.note}</p>}

          {score.strengths.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Working for you</p>
              <ul className="mt-1 list-disc pl-5 text-[13px] text-tx2">
                {score.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {score.weak_spots.length > 0 && (
            <div className="mt-3 rounded-lg border-l-[3px] border-warn bg-warn-bg p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-warn">Fix before you send</p>
              <ul className="mt-1 space-y-1.5 text-[13px] text-tx2">
                {score.weak_spots.map((w, i) => (
                  <li key={i}>
                    <span className="font-medium text-tx">{w.issue}</span>
                    {w.fix ? <> — {w.fix}</> : null}
                  </li>
                ))}
              </ul>
              <Link href={`/studio/resume/${artifactId}`} className="mt-2 inline-block text-xs text-info-tx underline">
                Open the editor to fix →
              </Link>
            </div>
          )}
          <p className="mt-2 text-[11px] text-tx3">
            RO&apos;s calibrated read, not a gate — you decide when it goes out.
          </p>
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

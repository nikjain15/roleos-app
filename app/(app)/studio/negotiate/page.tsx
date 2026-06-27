"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Gate 5 — negotiation (auto → you send). Paste an offer → RO benchmarks, models
 * the levers, and drafts the counter + the leverage behind it. RO drafts; YOU
 * send — the "Send it" is human-gated (the dispatch route is the only outbound
 * path, and it isn't auto-triggered). Voice per ro-voice.html.
 */
type Result = {
  parsed?: { base?: string; equity?: string; bonus?: string; level?: string; start?: string };
  benchmark?: string;
  leverage?: string[];
  scenarios?: { lever: string; likelihood: string; expected_value: string }[];
  counter?: string;
  narrative?: string;
};

export default function Negotiate() {
  const [offer, setOffer] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (offer.trim().length < 20 || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer }),
      });
      const j = await res.json();
      if (j.result) setResult(j.result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx3">← feed</Link>
        <span className="font-mono text-xs text-tx3">gate 5 · negotiation · you send</span>
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Close it</h1>
      <p className="mt-1 text-sm text-tx3">Paste the offer. I&apos;ll benchmark it, model the levers, and draft your counter — you send it.</p>

      <textarea
        value={offer}
        onChange={(e) => setOffer(e.target.value)}
        rows={5}
        placeholder="e.g. Stripe — Staff PM. Base $235k, equity $180k/4yr, 15% bonus, level L5, start in 6 weeks…"
        className="mt-5 w-full rounded-xl border border-bd bg-surf p-4 text-[15px] text-tx outline-none focus:border-info"
      />
      <button
        onClick={run}
        disabled={busy || offer.trim().length < 20}
        className="mt-3 rounded-md bg-info px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {busy ? "RO is working the numbers…" : "Work the negotiation"}
      </button>

      {result && (
        <div className="mt-8 space-y-4">
          {result.benchmark && (
            <div className="rounded-xl border-l-[3px] border-info bg-info-bg p-4 text-[15px] text-info-tx">
              <span className="text-[11px] font-semibold uppercase tracking-wide">Benchmark</span>
              <p className="mt-1">{result.benchmark}</p>
            </div>
          )}

          {result.scenarios && (
            <div className="rounded-xl border border-bd bg-surf p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">The levers</p>
              <div className="mt-2 space-y-2">
                {result.scenarios.map((s, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-semibold text-tx">{s.lever}</span>{" "}
                    <span className={
                      s.likelihood === "high" ? "text-suc" : s.likelihood === "med" ? "text-warn" : "text-tx3"
                    }>
                      ({s.likelihood})
                    </span>
                    <p className="text-tx3">{s.expected_value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.counter && (
            <div className="rounded-xl border border-bd bg-surf2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Your counter — drafted</p>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-tx">{result.counter}</p>
              {result.narrative && <p className="mt-3 text-xs text-tx3"><span className="font-semibold">The leverage: </span>{result.narrative}</p>}
              <div className="mt-4 flex items-center gap-3">
                <button
                  disabled
                  className="rounded-md bg-info px-4 py-2 text-sm font-medium text-white opacity-50"
                  title="Sending is the separate, user-clicked dispatch — RO never sends."
                >
                  Send it ↗
                </button>
                <span className="text-xs text-tx3">You press send — nothing leaves the building without your click.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

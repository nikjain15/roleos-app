"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  compareOffers,
  DEFAULT_WEIGHTS,
  OFFERS_STORAGE_KEY,
  parseOffers,
  type Offer,
  type Weights,
} from "@/lib/comp";

/**
 * X5 — client-side offer comparison. Offers live ONLY in this browser
 * (localStorage, validated parse, one-click clear). Pure math, arithmetic
 * visible, the decision stays the user's.
 */
const EMPTY: Offer = { name: "", base_usd: 0, total_usd: null, equity_note: "", growth: 3, life_fit: 3, mission: 3 };

export default function OfferCompare() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      setOffers(parseOffers(window.localStorage.getItem(OFFERS_STORAGE_KEY)));
    } catch {
      /* private mode — start fresh */
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      if (offers.length === 0) window.localStorage.removeItem(OFFERS_STORAGE_KEY);
      else window.localStorage.setItem(OFFERS_STORAGE_KEY, JSON.stringify(offers));
    } catch {
      /* persistence is best-effort */
    }
  }, [offers, restored]);

  const valid = offers.filter((o) => o.name.trim() && o.base_usd > 0);
  const scores = compareOffers(valid, weights);

  const upd = (i: number, patch: Partial<Offer>) =>
    setOffers((os) => os.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <div className="space-y-5">
      <section aria-label="Your offers">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Your offers ({offers.length}/3)</h2>
          <div className="flex gap-2">
            {offers.length < 3 && (
              <button onClick={() => setOffers((os) => [...os, { ...EMPTY }])} className="min-h-9 rounded-md bg-info px-3 text-xs font-medium text-white">
                + Add offer
              </button>
            )}
            {offers.length > 0 && (
              <button onClick={() => setOffers([])} className="min-h-9 rounded-md border border-bd px-3 text-xs text-tx2">
                Clear all (this browser only)
              </button>
            )}
          </div>
        </div>

        {offers.length === 0 && (
          <p className="mt-3 rounded-xl border border-bd bg-surf2 p-5 text-[14px] text-tx2">
            No offers entered. Add one when it lands — congratulations in advance.
          </p>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((o, i) => (
            <div key={i} className="rounded-lg border border-bd bg-surf p-3 text-xs">
              <label className="block">
                Offer name
                <input value={o.name} onChange={(e) => upd(i, { name: e.target.value.slice(0, 80) })} placeholder="Acme — Staff PM" className={inp} />
              </label>
              <label className="mt-2 block">
                Base ($/yr)
                <input type="number" inputMode="numeric" value={o.base_usd || ""} onChange={(e) => upd(i, { base_usd: Number(e.target.value) || 0 })} className={inp} />
              </label>
              <label className="mt-2 block">
                Your total-comp estimate ($/yr, optional)
                <input type="number" inputMode="numeric" value={o.total_usd ?? ""} onChange={(e) => upd(i, { total_usd: Number(e.target.value) || null })} className={inp} />
              </label>
              <label className="mt-2 block">
                Equity notes
                <input value={o.equity_note ?? ""} onChange={(e) => upd(i, { equity_note: e.target.value.slice(0, 300) })} placeholder="0.1%, 4yr vest, 409A unknown" className={inp} />
              </label>
              {(["growth", "life_fit", "mission"] as const).map((k) => (
                <label key={k} className="mt-2 flex items-center justify-between gap-2">
                  <span className="capitalize">{k.replace("_", " ")} (your read)</span>
                  <input type="range" min={1} max={5} value={o[k]} onChange={(e) => upd(i, { [k]: Number(e.target.value) } as Partial<Offer>)} />
                  <span className="w-4 text-right font-mono">{o[k]}</span>
                </label>
              ))}
              <button onClick={() => setOffers((os) => os.filter((_, j) => j !== i))} className="mt-3 text-[11px] text-tx3 underline">
                remove
              </button>
            </div>
          ))}
        </div>
      </section>

      {valid.length >= 2 && (
        <>
          <section className="rounded-xl border border-bd bg-surf p-4" aria-label="Your priorities">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">What matters to you (weights)</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(Object.keys(weights) as Array<keyof Weights>).map((k) => (
                <label key={k} className="flex items-center justify-between gap-2 text-xs">
                  <span className="capitalize">{k.replace("_", " ")}</span>
                  <input type="range" min={0} max={60} value={weights[k]} onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))} />
                  <span className="w-6 text-right font-mono">{weights[k]}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="overflow-x-auto rounded-xl border border-bd bg-surf p-4" aria-label="Comparison">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">The math, shown</h2>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left text-tx3">
                  <th className="py-1 pr-3 font-semibold">Offer</th>
                  <th className="py-1 pr-3 font-semibold">Comp</th>
                  <th className="py-1 pr-3 font-semibold">Growth</th>
                  <th className="py-1 pr-3 font-semibold">Life fit</th>
                  <th className="py-1 pr-3 font-semibold">Mission</th>
                  <th className="py-1 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s, i) => (
                  <tr key={s.name} className="border-t border-bd text-tx2">
                    <td className="py-1.5 pr-3 font-medium text-tx">
                      {s.name}
                      {i === 0 && scores.length > 1 && s.total > scores[1].total && (
                        <span className="ml-1.5 rounded bg-suc-bg px-1.5 py-0.5 text-[10px] text-suc">leads on YOUR weights</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 font-mono">{s.parts.comp}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.parts.growth}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.parts.life_fit}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.parts.mission}</td>
                    <td className="py-1.5 font-mono font-semibold text-tx">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-tx3">
              A score, not a verdict — change the weights and watch it move. For the negotiation
              itself, <Link href="/studio/negotiate" className="underline">bring an offer to RO</Link>.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

const inp = "mt-1 w-full rounded-md border border-bd bg-bg px-2 py-1.5 text-xs text-tx";

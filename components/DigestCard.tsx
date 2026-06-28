"use client";

import { useEffect, useState } from "react";

/**
 * The ambient digest, in the feed (journey.html §6/§10). On load it asks RO to
 * catch the user up (build-if-due — cheap unless the cadence interval has
 * passed), then renders "what I did / what needs you" in her voice. The cron
 * scheduler keeps this fresh in the background; this is the in-feed face of it.
 */
type Digest = { title: string; did: string[]; needs: string[]; note?: string };

export default function DigestCard() {
  const [d, setD] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/digest", { method: "POST" })
      .then((r) => r.json())
      .then((j) => setD(j.digest ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-6 rounded-xl border border-bd bg-surf2 p-5 text-sm text-tx2">
        <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
        Catching you up…
      </div>
    );
  }
  if (!d) return null;

  return (
    <div className="mt-6 rounded-xl border border-bd bg-surf2 p-5">
      <p className="text-[15px] font-semibold text-tx">{d.title}</p>

      {d.did?.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">What I did</p>
          <ul className="mt-1.5 space-y-1">
            {d.did.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm text-tx2">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-suc" />
                {x}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.needs?.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-warn">Needs your judgment</p>
          <ul className="mt-1.5 space-y-1">
            {d.needs.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm text-tx">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-warn" />
                {x}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.note && <p className="mt-3 border-t border-bd pt-3 text-sm text-tx2">{d.note}</p>}
    </div>
  );
}

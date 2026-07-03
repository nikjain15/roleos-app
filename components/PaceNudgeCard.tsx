"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Surfaces RO's latest goal-anchored pace nudge in the feed (Slice 9). Assertive
 * about the user's own deadline, never guilt — the copy comes from the wellbeing-
 * gated `pace-nudge` builder. Dismissible ("got it" marks it read). RLS via /api/nudge.
 */
interface Nudge {
  id: string;
  title: string;
  body: string; // JSON {lever, message}
}

export default function PaceNudgeCard() {
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    fetch("/api/nudge")
      .then((r) => (r.ok ? r.json() : { nudge: null }))
      .then((d: { nudge?: Nudge | null }) => setNudge(d.nudge ?? null))
      .catch(() => setNudge(null));
  }, []);

  if (!nudge || gone) return null;

  let lever = "";
  try {
    lever = (JSON.parse(nudge.body) as { lever?: string }).lever ?? "";
  } catch {
    lever = "";
  }

  async function dismiss() {
    setGone(true);
    try {
      await fetch("/api/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: nudge!.id }),
      });
    } catch {
      /* best-effort */
    }
  }

  return (
    <div className="mt-6 rounded-xl border-l-[3px] border-warn bg-warn-bg p-4" role="status">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-warn">{nudge.title}</p>
          {lever && <p className="mt-1 text-[13px] text-tx2">{lever}</p>}
          <Link href="/goal" className="mt-2 inline-flex text-xs font-medium text-info-tx underline">
            See the plan →
          </Link>
        </div>
        <button onClick={dismiss} className="shrink-0 text-xs text-tx3 underline">
          got it
        </button>
      </div>
    </div>
  );
}

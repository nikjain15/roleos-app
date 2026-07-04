"use client";

import { useState } from "react";

/**
 * The overnight hunt's user control (slice X1). Shows what RO does at night —
 * plainly, no mystery — and gives a one-click pause/resume. Pausing is honored
 * by the nightly cron immediately (profiles.ambient.hunt_paused). Sending is
 * untouched either way: drafts always wait for the user's click.
 */
export default function HuntToggle({ initialPaused }: { initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setErr(null);
    const next = !paused;
    try {
      const res = await fetch("/api/hunt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: next }),
      });
      if (res.ok) setPaused(next);
      else setErr("Couldn't save — try again.");
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Overnight hunt" className="mt-6 rounded-xl border border-bd bg-surf p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            Overnight hunt{" "}
            <span className={`font-mono text-[11px] ${paused ? "text-tx3" : "text-suc"}`}>
              {paused ? "· paused" : "· on"}
            </span>
          </h2>
          <p className="mt-1 max-w-xl text-xs text-tx2">
            {paused
              ? "I'm not hunting at night. Resume any time — I'll pick it up the next night."
              : "While you sleep I look for fresh roles that fit your goal and pre-draft résumés for the best ones. They land here, in your queue — nothing is ever sent without you."}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={!paused}
          className="rounded-lg border border-bd px-3 py-1.5 text-xs font-medium hover:bg-surf2 disabled:opacity-50"
        >
          {busy ? "Saving…" : paused ? "Resume overnight hunt" : "Pause overnight hunt"}
        </button>
      </div>
      {err && (
        <p role="alert" className="mt-2 text-xs text-warn">
          {err}
        </p>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Goal switching (slice W7, multi-goal-lite). Lists the user's non-active goals
 * as alternates; switching activates one (parking the current) and recomputes
 * its plan. Archiving tidies the list. Every change is the user's click —
 * nothing outward, nothing automatic.
 */
export interface AltGoal {
  id: string;
  label: string;
  status: string; // paused | archived | achieved
  deadline: string | null;
}

export default function GoalSwitcher({ alternates }: { alternates: AltGoal[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(goalId: string, action: "activate" | "archive") {
    setBusy(goalId);
    setErr(null);
    try {
      const res = await fetch("/api/goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId, action }),
      });
      if (res.ok) router.refresh();
      else setErr(((await res.json()) as { error?: string }).error ?? "Couldn't switch.");
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  if (alternates.length === 0) return null;

  return (
    <section aria-label="Other goals" className="mt-8 rounded-xl border border-bd bg-surf p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Other goals</h2>
      <p className="mt-1 text-xs text-tx2">
        Switching re-aims your plan and pace immediately; your shortlist re-aims on the next match refresh.
      </p>
      <ul className="mt-3 space-y-2">
        {alternates.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-bd bg-surf2 p-2.5">
            <div className="min-w-0 text-[13px]">
              <span className="font-medium text-tx">{g.label}</span>
              <span className="text-tx3">
                {" "}· {g.status}
                {g.deadline ? ` · by ${g.deadline}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => act(g.id, "activate")}
                disabled={busy === g.id}
                className="min-h-9 rounded-md bg-primary px-2.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy === g.id ? "Switching…" : "Switch to this goal"}
              </button>
              {g.status !== "archived" && (
                <button
                  onClick={() => act(g.id, "archive")}
                  disabled={busy === g.id}
                  className="min-h-9 rounded-md border border-bd px-2.5 text-xs text-tx2 disabled:opacity-50"
                >
                  Archive
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {err && (
        <p className="mt-2 text-xs text-dng" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}

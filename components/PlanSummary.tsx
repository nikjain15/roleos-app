"use client";

import type { Plan, Verdict } from "@/lib/plan/types";

/**
 * Presentational plan readout (goal-engine.md §3): on-pace status + the single
 * best lever, backward funnel as ranges (never false precision), weekly pace,
 * apply-by date, and the derived phases. Used by the Goal Setter and the Feed.
 */
const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  on_track: { label: "On track", cls: "border-suc bg-suc-bg text-suc" },
  at_risk: { label: "At risk", cls: "border-warn bg-warn-bg text-warn" },
  off_track: { label: "Off track", cls: "border-dng bg-warn-bg text-dng" },
  no_deadline: { label: "No deadline set", cls: "border-bd bg-surf2 text-tx2" },
};

export default function PlanSummary({ plan, onGoToFeed }: { plan: Plan; onGoToFeed?: () => void }) {
  const v = VERDICT[plan.feasibility.verdict];
  const f = plan.funnel;

  return (
    <div className="rounded-xl border border-bd bg-surf p-5">
      <div className={`inline-flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-2 text-[13px] ${v.cls}`} role="status">
        <b>{v.label}.</b>
        {plan.daysLeft !== null && <span>{plan.daysLeft} days to your date.</span>}
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-tx">{plan.feasibility.message}</p>

      {plan.feasibility.verdict !== "no_deadline" && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Apply / wk" value={`${plan.weekly.applications}`} />
            <Stat label="Add roles / wk" value={`${plan.weekly.addRoles}`} />
            <Stat label="Apply by" value={plan.applyByDate ?? "—"} small />
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
              What it takes (≈ranges to ~1 offer)
            </p>
            <ul className="mt-1.5 space-y-1 text-[13px] text-tx2">
              <li>~{f.applications.low}–{f.applications.high} targeted applications</li>
              <li>~{f.screens.low}–{f.screens.high} first interviews</li>
              <li>~{f.onsites.low}–{f.onsites.high} final rounds → 1 offer</li>
            </ul>
          </div>

          <div className="mt-4 rounded-lg bg-surf2 p-3 text-[13px] text-tx">
            <span className="font-semibold">Your one lever:</span> {plan.feasibility.bestLever}
          </div>

          {plan.phases.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Phases</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {plan.phases.map((ph) => (
                  <span key={ph.key} className="rounded-md bg-surf2 px-2 py-1 text-xs text-tx2">
                    {ph.label.split(" — ")[0]} · d{ph.startDay}–{ph.endDay}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {onGoToFeed && (
        <button
          onClick={onGoToFeed}
          className="mt-5 min-h-10 w-full rounded-md border border-bd text-sm text-tx hover:bg-surf2"
        >
          Go to your feed →
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg bg-surf2 p-2">
      <p className={`font-semibold text-tx ${small ? "text-xs" : "text-lg"}`}>{value}</p>
      <p className="text-[11px] text-tx3">{label}</p>
    </div>
  );
}

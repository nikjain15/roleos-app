"use client";

import Link from "next/link";
import type { Plan, Verdict, AgendaItem } from "@/lib/plan/types";

/**
 * Feed cockpit (goal-engine.md §4): the goal's on-pace status + the ranked "Today"
 * agenda — the shortest list of moves that keeps you on track, never a dump. When
 * no goal is set, it's a single clear CTA (no dead-end). Client so it can share
 * the pace types; data is computed server-side and passed in.
 */
const PILL: Record<Verdict, string> = {
  on_track: "border-suc bg-suc-bg text-suc",
  at_risk: "border-warn bg-warn-bg text-warn",
  off_track: "border-dng bg-warn-bg text-dng",
  no_deadline: "border-bd bg-surf2 text-tx2",
};
const LABEL: Record<Verdict, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  no_deadline: "No deadline",
};

export default function GoalCockpit({
  plan,
  agenda,
}: {
  plan: Plan | null;
  agenda: AgendaItem[];
}) {
  if (!plan) {
    return (
      <div className="mt-6 rounded-xl border border-primary bg-info-bg p-5">
        <p className="text-[15px] font-medium text-info-tx">Give RO a goal to run toward.</p>
        <p className="mt-1 text-[13px] text-tx2">
          &quot;A Senior AI PM offer at a Series-B+ in 60 days&quot; — I&apos;ll build the plan, pace it,
          and keep you on track.
        </p>
        <Link
          href="/goal"
          className="mt-3 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white"
        >
          Set your goal →
        </Link>
      </div>
    );
  }

  const v = plan.feasibility.verdict;

  return (
    <div className="mt-6 rounded-xl border border-bd bg-surf p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-lg border-l-[3px] px-2.5 py-1 text-[13px] ${PILL[v]}`} role="status">
            <b>{LABEL[v]}</b>
          </span>
          {plan.daysLeft !== null && (
            <span className="text-[13px] text-tx2">
              {plan.daysLeft} days left · ~{plan.weekly.applications} apps/wk
            </span>
          )}
        </div>
        <Link href="/goal" className="text-xs text-tx3 hover:text-primary">
          view plan →
        </Link>
      </div>

      <h2 className="mt-4 text-sm font-semibold text-tx">
        Today{plan.deadline ? ` · to stay on track for ${plan.deadline}` : ""}
      </h2>
      <ol className="mt-2 space-y-2">
        {agenda.slice(0, 3).map((item, i) => (
          <li key={item.id} className="flex gap-3 rounded-lg bg-surf2 p-3">
            <span className="mt-0.5 text-sm font-semibold text-tx3">{i + 1}</span>
            <div className="min-w-0">
              {item.href ? (
                <Link href={item.href} className="text-[14px] font-medium text-tx hover:text-primary">
                  {item.title}
                </Link>
              ) : (
                <span className="text-[14px] font-medium text-tx">{item.title}</span>
              )}
              {item.detail && <p className="mt-0.5 text-[12px] text-tx3">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

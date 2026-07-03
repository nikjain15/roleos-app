"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The tracker board (Slice 3). Stage-grouped lanes (responsive — stacks on mobile,
 * no horizontal Kanban scroll) with an accessible stage <select> to advance, plus
 * one-tap "track" for pursued roles not yet in the pipeline. Every change PATCHes/
 * POSTs the RLS-scoped API and refreshes. a11y: labelled selects, ≥40px targets.
 */
export interface AppRow {
  id: string;
  role_id: string | null;
  stage: string;
  stage_history: Array<{ stage: string; at: string }> | null;
  next_action: { label: string; due?: string } | null;
  sent_at: string | null;
  roles: { company: string; role_title: string; url: string | null } | null;
}

export interface TrackableRole {
  role_id: string | null;
  fit_score: number | null;
  roles: { company: string; role_title: string } | null;
}

const STAGES = [
  "saved", "drafting", "ready", "applied", "screening",
  "interviewing", "onsite", "offer", "rejected", "withdrawn",
] as const;

const LANES: { key: string; label: string; stages: string[] }[] = [
  { key: "prep", label: "Preparing", stages: ["saved", "drafting", "ready"] },
  { key: "live", label: "Applied & interviewing", stages: ["applied", "screening", "interviewing", "onsite"] },
  { key: "offer", label: "Offers", stages: ["offer"] },
  { key: "closed", label: "Closed", stages: ["rejected", "withdrawn"] },
];

const STAGE_LABEL: Record<string, string> = {
  saved: "Saved", drafting: "Drafting", ready: "Ready to send", applied: "Applied",
  screening: "Screening", interviewing: "Interviewing", onsite: "Onsite / final",
  offer: "Offer", rejected: "Rejected", withdrawn: "Withdrawn",
};

export default function TrackerBoard({ apps, trackable }: { apps: AppRow[]; trackable: TrackableRole[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function advance(id: string, stage: string) {
    setBusy(id);
    try {
      await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, stage }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function track(role_id: string) {
    setBusy(role_id);
    try {
      await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_id, stage: "saved" }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const byLane = (laneStages: string[]) => apps.filter((a) => laneStages.includes(a.stage));

  return (
    <div className="space-y-6">
      {apps.length === 0 && trackable.length === 0 && (
        <div className="rounded-xl border border-bd bg-surf2 p-6 text-[15px] text-tx2">
          Nothing in your pipeline yet. Once RO lines up roles worth pursuing, track them here and
          I&apos;ll keep your funnel — and your pace — honest.{" "}
          <a href="/roles" className="underline">Find roles →</a>
        </div>
      )}

      {LANES.map((lane) => {
        const laneApps = byLane(lane.stages);
        if (laneApps.length === 0) return null;
        return (
          <section key={lane.key} aria-label={lane.label}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
              {lane.label} · {laneApps.length}
            </h2>
            <div className="mt-2 space-y-2">
              {laneApps.map((a) => (
                <div key={a.id} className="rounded-lg border border-bd bg-surf p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-tx">
                        {a.roles?.role_title ?? "Role"}{" "}
                        <span className="text-tx3">· {a.roles?.company ?? ""}</span>
                      </p>
                      {a.next_action?.label && (
                        <p className="mt-0.5 text-xs text-info-tx">Next: {a.next_action.label}</p>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-tx3">
                      <span className="sr-only">Stage for {a.roles?.role_title}</span>
                      <select
                        value={a.stage}
                        disabled={busy === a.id}
                        onChange={(e) => advance(a.id, e.target.value)}
                        className="min-h-9 rounded-md border border-bd bg-surf2 px-2 text-[13px] text-tx"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {trackable.length > 0 && (
        <section aria-label="Pursued roles to track">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
            Pursued — add to your pipeline
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {trackable.map((m) => (
              <button
                key={m.role_id}
                disabled={busy === m.role_id}
                onClick={() => m.role_id && track(m.role_id)}
                className="min-h-10 rounded-md border border-info bg-info-bg px-3 text-[13px] text-info-tx disabled:opacity-50"
              >
                + {m.roles?.role_title} · {m.roles?.company}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import ReadinessMeter from "./ReadinessMeter";
import { meterView } from "@/lib/resume/meter";
import type { ResumeScore, ScoreLift } from "@/lib/resume/score";

/**
 * Client wrapper for the readiness meter (résumé-editor v2, P2 + async). Renders a
 * cached score if the artifact has one; otherwise scoring is client-driven async
 * (same pattern as tailoring): a click kicks off the compute (POST) and we POLL the
 * cached score (GET) with live progress, so the button never freezes for a minute.
 * The view model (meterView) is pure, computed client-side from the score.
 */
const STAGES = [
  "Reading the role's requirements…",
  "Matching your evidence…",
  "Judging coverage line by line…",
  "Comparing to your master…",
  "Almost there…",
];

export type ScoreCalibration = { note: string | null; collectiveNote: string | null };

export default function ResumeReadiness({
  id,
  initialScore,
  initialLift,
  initialCalibration = null,
}: {
  id: string;
  initialScore: ResumeScore | null;
  initialLift: ScoreLift | null;
  initialCalibration?: ScoreCalibration | null;
}) {
  const [score, setScore] = useState<ResumeScore | null>(initialScore);
  const [lift, setLift] = useState<ScoreLift | null>(initialLift);
  const [calibration, setCalibration] = useState<ScoreCalibration | null>(initialCalibration);
  const [scoring, setScoring] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scoring) return;
    let cancelled = false;
    const apply = (
      b: { score?: ResumeScore; lift?: ScoreLift | null; calibration?: ScoreCalibration | null } | undefined,
    ) => {
      if (cancelled || !b?.score) return;
      setScore(b.score);
      setLift(b.lift ?? null);
      setCalibration(b.calibration ?? null);
      setScoring(false);
    };
    // Kick off the compute (the server caches it); use its response if it returns.
    fetch(`/api/artifact/${id}/score`, { method: "POST" })
      .then((r) => r.json())
      .then(apply)
      .catch(() => {
        /* the poll below still catches the cached result */
      });
    const cycle = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 12_000);
    const poll = setInterval(async () => {
      try {
        const b = await fetch(`/api/artifact/${id}/score`).then((r) => r.json());
        if (b?.score) apply(b);
      } catch {
        /* transient — keep polling */
      }
    }, 3000);
    const stop = setTimeout(() => {
      if (!cancelled) {
        setScoring(false);
        setError("Scoring took longer than expected — try again.");
      }
    }, 320_000);
    return () => {
      cancelled = true;
      clearInterval(cycle);
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [scoring, id]);

  function start() {
    setError(null);
    setStage(0);
    setScoring(true);
  }

  if (scoring) {
    return (
      <div className="rounded-xl border border-bd bg-surf p-5">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-bd border-t-primary" />
          <div>
            <p className="text-small font-medium text-tx">Scoring your résumé…</p>
            <p aria-live="polite" className="text-small text-tx3">
              {STAGES[stage]}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!score) {
    return (
      <div className="rounded-xl border border-bd bg-surf p-5">
        <p className="text-small text-tx2">
          See how strongly this résumé makes your case for the role — coverage of its stated requirements by your real
          evidence.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={start}>Score readiness</Button>
          {error && <span className="text-small text-dng-tx">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ReadinessMeter view={meterView(score, { lift })} readback={[calibration?.note ?? null, calibration?.collectiveNote ?? null]} />
      <div className="flex items-center gap-3">
        <button onClick={start} className="text-small text-tx3 hover:text-tx2">
          Re-score
        </button>
        {error && <span className="text-small text-dng-tx">{error}</span>}
      </div>
    </div>
  );
}

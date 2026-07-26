"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import ReadinessMeter from "./ReadinessMeter";
import { meterView } from "@/lib/resume/meter";
import type { ResumeScore, ScoreLift } from "@/lib/resume/score";

/**
 * Client wrapper for the readiness meter (résumé-editor v2, P2). Renders a cached
 * score if the artifact already has one; otherwise a single button computes it
 * on demand (POST /api/artifact/[id]/score — one metered model pass, not run on
 * every page load, to respect cost). The view model (meterView) is pure, computed
 * client-side from the returned score.
 */
export default function ResumeReadiness({
  id,
  initialScore,
  initialLift,
}: {
  id: string;
  initialScore: ResumeScore | null;
  initialLift: ScoreLift | null;
}) {
  const [score, setScore] = useState<ResumeScore | null>(initialScore);
  const [lift, setLift] = useState<ScoreLift | null>(initialLift);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function computeScore() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/artifact/${id}/score`, { method: "POST" });
      const body = (await res.json()) as { score?: ResumeScore; lift?: ScoreLift | null; error?: string };
      if (!res.ok || !body.score) throw new Error(body.error ?? "couldn't score this résumé");
      setScore(body.score);
      setLift(body.lift ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't score this résumé");
    } finally {
      setLoading(false);
    }
  }

  if (!score) {
    return (
      <div className="rounded-xl border border-bd bg-surf p-5">
        <p className="text-small text-tx2">
          See how strongly this résumé makes your case for the role — coverage of its stated requirements by your real
          evidence.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={computeScore} disabled={loading}>
            {loading ? "Scoring…" : "Score readiness"}
          </Button>
          {error && <span className="text-small text-dng-tx">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ReadinessMeter view={meterView(score, { lift })} />
      <div className="flex items-center gap-3">
        <button onClick={computeScore} disabled={loading} className="text-small text-tx3 hover:text-tx2 disabled:opacity-50">
          {loading ? "Re-scoring…" : "Re-score"}
        </button>
        {error && <span className="text-small text-dng-tx">{error}</span>}
      </div>
    </div>
  );
}

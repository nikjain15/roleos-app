import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { logAgentRuns } from "@/lib/agent-runs";
import {
  scoreTailoredResume,
  bulletsFromArtifact,
  sectionsFromArtifact,
  bulletsFromProfile,
  type RoleRow,
} from "@/lib/resume/judge";
import { scoreLift, type ScoreLift } from "@/lib/resume/score";
import { judgeCalibration, type ResumeFeedbackRow } from "@/lib/resume/feedback";
import { loadCollectivePrior } from "@/lib/ro/collective";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
// Scoring runs TWO coverage passes (the tailored résumé + the master baseline for
// `+N from your master`), each a bge retrieval + a reasoning-tier judge call. At
// 60s this timed out and the meter hung on "Scoring…". 300s matches the ceiling
// the other multi-model routes use (see /api/tailor, /api/cron/hunt).
export const maxDuration = 300;

/**
 * Compute the honest readiness score for one tailored résumé (résumé-editor v2,
 * P2). Runs the P1 coverage pipeline — bge evidence retrieval + the metered
 * coverage judge + the pure roll-up (lib/resume) — over the artifact's bullets
 * against its role's stated requirements, then caches the result on the artifact
 * so re-renders don't re-run the model. RLS-scoped: the artifact select only
 * returns the caller's own row. No send happens here.
 *
 * Meters every model call: the judge's runs are persisted via logAgentRuns.
 */
const Params = z.object({ id: z.string().uuid() });

/**
 * The cached score, for the client to POLL while a score computes (async scoring,
 * same pattern as tailoring). Returns { score, lift } once cached, else pending.
 * RLS-scoped read; no model call.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const parsed = Params.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: art } = await supabase
    .from("artifacts")
    .select("provenance")
    .eq("id", parsed.data.id)
    .single<{
      provenance: {
        score?: unknown;
        scoreLift?: ScoreLift | null;
        calibration?: { note: string | null; collectiveNote: string | null } | null;
      } | null;
    }>();
  if (!art) return NextResponse.json({ error: "not found" }, { status: 404 });
  const score = art.provenance?.score ?? null;
  return NextResponse.json({
    score,
    lift: art.provenance?.scoreLift ?? null,
    calibration: art.provenance?.calibration ?? null,
    pending: !score,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const parsed = Params.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const { id } = parsed.data;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, role_id, type, content, provenance")
    .eq("id", id)
    .single<{ id: string; role_id: string | null; type: string; content: unknown; provenance: Record<string, unknown> | null }>();
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (artifact.type !== "resume") return NextResponse.json({ error: "not a résumé" }, { status: 400 });
  if (!artifact.role_id) return NextResponse.json({ error: "no role to score against" }, { status: 400 });

  const bullets = bulletsFromArtifact(artifact.content);
  if (bullets.length === 0) return NextResponse.json({ error: "nothing to score yet" }, { status: 400 });

  const { data: role } = await supabase
    .from("roles")
    .select("must_haves, nice_to_haves")
    .eq("id", artifact.role_id)
    .single<RoleRow>();
  if (!role) return NextResponse.json({ error: "role not found" }, { status: 404 });

  const sections = sectionsFromArtifact(artifact.content);
  const { data: mp } = await supabase
    .from("master_profile")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle<{ data: { profile?: unknown } | null }>();
  const masterBullets = bulletsFromProfile(mp?.data?.profile);

  // Score the tailored résumé AND the master baseline (for `+N from your master`)
  // in PARALLEL — they're independent, so there's no reason to wait sequentially.
  // Lift is skipped (null, honest) when there's no structured master to baseline.
  const [tailoredRes, masterRes] = await Promise.all([
    scoreTailoredResume(role, bullets, { sections }),
    masterBullets.length > 0 ? scoreTailoredResume(role, masterBullets) : Promise.resolve(null),
  ]);
  const { score, runs } = tailoredRes;
  const allRuns = [...runs];
  let lift: ScoreLift | null = null;
  if (masterRes) {
    allRuns.push(...masterRes.runs);
    lift = scoreLift(masterRes.score, score);
  }

  await logAgentRuns(user.id, allRuns, { skill: "judge_coverage" });

  // Calibration read-back (P4 follow-up): how often the user corrected vs kept
  // RO's résumé lines, shrunk toward the anonymous collective prior. DERIVED and
  // honest — a note about the judge, never a prediction. Fail-safe: scoring never
  // breaks because the read-back couldn't load.
  let calibration: { note: string | null; collectiveNote: string | null } | null = null;
  try {
    const [{ data: events }, prior] = await Promise.all([
      supabase
        .from("decision_events")
        .select("action, payload")
        .eq("kind", "resume")
        .order("created_at", { ascending: false })
        .limit(500),
      loadCollectivePrior(supabaseService()),
    ]);
    const cal = judgeCalibration((events ?? []) as ResumeFeedbackRow[], { prior: prior.correctionRate });
    calibration = { note: cal.note, collectiveNote: prior.note };
  } catch {
    /* read-back is optional; the score stands on its own */
  }

  // Cache the score + lift on the artifact (merge — never clobber other provenance).
  const scoredAt = new Date().toISOString();
  await supabase
    .from("artifacts")
    .update({
      provenance: { ...(artifact.provenance ?? {}), score: { ...score, scoredAt }, scoreLift: lift, calibration },
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, score, lift, scoredAt, calibration });
}

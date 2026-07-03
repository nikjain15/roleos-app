import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { validateBody } from "@/lib/validate";
import { runSkill } from "@/agent/skills/run";
import appScore from "@/agent/skills/app_score";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * X3 — score one application (approved résumé × its role) before the user
 * sends it. Auth → rate limit → ownership/approval checks → reason-tier skill
 * (metered) → persist on the artifact's provenance + an append-only
 * decision_event (the X4 calibration substrate). A low score warns; it NEVER
 * blocks /api/apply. No transport anywhere.
 */
const BodySchema = z.object({ artifactId: z.string().uuid() });

const SCORE_MAX_PER_HOUR = 8;

/**
 * Per-user rolling-window limit on the shared rate_events table (already live).
 * Kept inline so this branch doesn't depend on H3's lib; converge post-merge.
 */
async function underScoreLimit(userId: string): Promise<boolean> {
  try {
    const db = supabaseService();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error } = await db
      .from("rate_events")
      .select("*", { count: "exact", head: true })
      .eq("scope", "apply_score")
      .eq("subject", userId)
      .gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) >= SCORE_MAX_PER_HOUR) return false;
    await db.from("rate_events").insert({ scope: "apply_score", subject: userId });
    return true;
  } catch {
    return true; // fail-open — the limiter must never down the feature
  }
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { artifactId } = parsed.data;

  if (!(await underScoreLimit(user.id))) {
    return NextResponse.json(
      { error: "You've scored a lot this hour — fix the flagged spots first; it resets soon." },
      { status: 429 },
    );
  }

  // RLS scopes this to the caller's own artifacts.
  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, type, status, content, provenance, role_id, roles(company, role_title, must_haves, nice_to_haves)")
    .eq("id", artifactId)
    .maybeSingle<{
      id: string;
      type: string;
      status: string;
      content: Record<string, unknown>;
      provenance: Record<string, unknown> | null;
      role_id: string | null;
      roles: Record<string, unknown> | null;
    }>();
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (artifact.type !== "resume" || !artifact.role_id || !artifact.roles) {
    return NextResponse.json({ error: "score works on a role-linked résumé" }, { status: 400 });
  }
  if (artifact.status !== "approved") {
    return NextResponse.json({ error: "approve the résumé first — the score judges what you'd actually send" }, { status: 409 });
  }

  // Stored match read (fit + gaps) as context — never required.
  const { data: match } = await supabase
    .from("matches")
    .select("fit_score, reasoning, gaps")
    .eq("role_id", artifact.role_id)
    .maybeSingle<{ fit_score: number | null; reasoning: { why?: string } | null; gaps: unknown }>();

  const { verdict } = await runSkill(appScore, {
    userId: user.id,
    data: {
      role: artifact.roles,
      resume: artifact.content,
      match: match ? { fit: match.fit_score, why: match.reasoning?.why ?? null, gaps: match.gaps } : null,
    },
  });
  await logAgentRuns(user.id, verdict.runs, { skill: "app_score", judge: verdict });

  const score = parseModelJson<{
    score?: number;
    screen_likelihood?: string;
    strengths?: string[];
    weak_spots?: Array<{ issue?: string; fix?: string }>;
    note?: string;
  }>(verdict.finalOutput);
  if (!score || typeof score.score !== "number") {
    return NextResponse.json({ error: "RO couldn't produce a grounded score — try again" }, { status: 500 });
  }

  const stored = {
    score: Math.round(score.score),
    screen_likelihood: score.screen_likelihood ?? "medium",
    strengths: (score.strengths ?? []).slice(0, 4),
    weak_spots: (score.weak_spots ?? []).slice(0, 5),
    note: score.note ?? "",
    scored_at: new Date().toISOString(),
  };

  // Latest score rides the artifact (no migration); history lives in decision_events.
  await supabase
    .from("artifacts")
    .update({ provenance: { ...(artifact.provenance ?? {}), app_score: stored } })
    .eq("id", artifact.id);

  // Append-only calibration substrate (X4 joins this against real outcomes).
  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "app_score",
    subject_ref: artifact.id,
    action: "view",
    payload: { role_id: artifact.role_id, score: stored.score, likelihood: stored.screen_likelihood },
    weight: 1,
  });

  return NextResponse.json({ ok: true, app_score: stored });
}

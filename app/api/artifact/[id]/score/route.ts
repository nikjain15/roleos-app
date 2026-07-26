import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { logAgentRuns } from "@/lib/agent-runs";
import { scoreTailoredResume, bulletsFromArtifact, type RoleRow } from "@/lib/resume/judge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const { score, runs } = await scoreTailoredResume(role, bullets);
  await logAgentRuns(user.id, runs, { skill: "judge_coverage" });

  // Cache the score on the artifact (merge — never clobber other provenance).
  const scoredAt = new Date().toISOString();
  await supabase
    .from("artifacts")
    .update({ provenance: { ...(artifact.provenance ?? {}), score: { ...score, scoredAt } } })
    .eq("id", id);

  return NextResponse.json({ ok: true, score, scoredAt });
}

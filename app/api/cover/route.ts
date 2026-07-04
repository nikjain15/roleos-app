import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { runSkill } from "@/agent/skills/run";
import draftCover from "@/agent/skills/draft_cover";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({ roleId: z.string().uuid() });

/**
 * Slice W2 — draft a REAL cover letter for one role (replaces the template in
 * Apply). Authenticated; RLS-scoped. Runs draft_cover over the user's
 * master_profile + the role through the quality gate (incl. the truth gate),
 * persists a `cover` artifact, and returns it. If an approved résumé exists for
 * the role, its angle is passed so the letter stays consistent with it.
 * No send — the user reviews, edits, approves, and sends themselves.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "roleId (uuid) required" }, { status: 400 });
  const { roleId } = parsed.data;

  const { data: mp } = await supabase.from("master_profile").select("data").eq("user_id", user.id).single();
  const profileRaw = (mp?.data as { raw?: string } | null)?.raw;
  if (!profileRaw) {
    return NextResponse.json({ error: "no master profile yet — run onboarding first" }, { status: 400 });
  }

  const { data: role, error: rErr } = await supabase
    .from("roles")
    .select("id, company, role_title, must_haves, nice_to_haves")
    .eq("id", roleId)
    .single();
  if (rErr || !role) return NextResponse.json({ error: "role not found" }, { status: 404 });

  // Stay consistent with the résumé the user already approved for this role, if any.
  const { data: resumeArt } = await supabase
    .from("artifacts")
    .select("content")
    .eq("user_id", user.id)
    .eq("role_id", roleId)
    .eq("type", "resume")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { verdict } = await runSkill(draftCover, {
    userId: user.id,
    data: {
      role,
      profile: profileRaw,
      groundTruth: profileRaw,
      resume: resumeArt?.content ?? undefined,
    },
  });

  await logAgentRuns(user.id, verdict.runs, { skill: "draft_cover", judge: verdict });

  const content: unknown = parseModelJson(verdict.finalOutput) ?? {};

  const status = verdict.status === "passed" ? "draft" : "needs_your_eyes";
  const { data: artifact, error: aErr } = await supabase
    .from("artifacts")
    .insert({
      user_id: user.id,
      role_id: roleId,
      type: "cover",
      content,
      provenance: {
        gate_status: verdict.status,
        truth: verdict.truth,
        critic: verdict.critic,
      },
      status,
    })
    .select("id, content, status, provenance")
    .single();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  return NextResponse.json({
    artifactId: artifact.id,
    status: artifact.status,
    content: artifact.content,
    truth: verdict.truth,
  });
}

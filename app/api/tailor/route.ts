import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runSkill } from "@/agent/skills/run";
import draftResume from "@/agent/skills/draft_resume";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Gate 1 — tailor a résumé for one role (journey.html §5). Authenticated;
 * RLS-scoped. Runs draft_resume over the user's master_profile + the role
 * through the quality gate (incl. the truth gate), persists an artifact, and
 * returns it. No send — the user reviews + sends from the studio (human-gated).
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { roleId } = (await req.json()) as { roleId?: string };
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });

  const { data: mp } = await supabase.from("master_profile").select("data").eq("user_id", user.id).single();
  const profileRaw = (mp?.data as { raw?: string } | null)?.raw;
  if (!profileRaw) {
    return NextResponse.json({ error: "no master profile yet — run onboarding first" }, { status: 400 });
  }

  const { data: role, error: rErr } = await supabase
    .from("roles")
    .select("id, company, role_title, must_haves, keywords")
    .eq("id", roleId)
    .single();
  if (rErr || !role) return NextResponse.json({ error: "role not found" }, { status: 404 });

  const { verdict } = await runSkill(draftResume, {
    userId: user.id,
    data: { role, profile: profileRaw, groundTruth: profileRaw },
  });

  await logAgentRuns(user.id, verdict.runs, { skill: "draft_resume", judge: verdict });

  const content: unknown = parseModelJson(verdict.finalOutput) ?? {};

  const status = verdict.status === "passed" ? "draft" : "needs_your_eyes";
  const { data: artifact, error: aErr } = await supabase
    .from("artifacts")
    .insert({
      user_id: user.id,
      role_id: roleId,
      type: "resume",
      content,
      provenance: {
        gate_status: verdict.status,
        truth: verdict.truth,
        critic: verdict.critic,
      },
      status,
    })
    .select("id")
    .single();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  return NextResponse.json({ artifactId: artifact.id, status });
}

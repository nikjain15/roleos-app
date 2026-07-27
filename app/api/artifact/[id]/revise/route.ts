import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { runSkill } from "@/agent/skills/run";
import reviseResume from "@/agent/skills/revise_resume";
import { logAgentRuns } from "@/lib/agent-runs";
import { parseModelJson } from "@/lib/json";
import { parseResumeDoc, type ResumeExperience } from "@/lib/resume/doc";
import { applyRevision, parseChanges, type ReviseChange } from "@/lib/resume/revise";
import { tuneAcceptEvent } from "@/lib/resume/feedback";

export const dynamic = "force-dynamic";
// Revise runs the full skill + truth-gate (draft + critic + revise loop) — minutes.
// 300s matches /api/tailor (the repo's ceiling for multi-model routes).
export const maxDuration = 300;

/**
 * Revise-by-instruction (résumé-editor v2, P3). Rewrites the tailored résumé on a
 * natural-language command — whole-résumé (command bar) or scoped to one section
 * ("tune this section"). Truth-gated (groundTruth = master) and, via
 * lib/resume/revise, SCOPED + LOCK-AWARE: only the in-scope section changes, and
 * ✓-locked lines are restored verbatim regardless of what the model returns.
 * RLS-scoped; meters every model call. No send happens here.
 */
const BodySchema = z.object({
  instruction: z.string().trim().min(1).max(500),
  sectionId: z.string().max(40).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { instruction, sectionId } = parsed.data;

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, status, content, role_id")
    .eq("id", id)
    .single<{ id: string; status: string; content: unknown; role_id: string | null }>();
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (artifact.status === "sent") return NextResponse.json({ error: "a sent résumé can't be revised" }, { status: 409 });
  if (!artifact.role_id) return NextResponse.json({ error: "no role to revise against" }, { status: 400 });

  const doc = parseResumeDoc(artifact.content);
  if (doc.experience.length === 0) return NextResponse.json({ error: "nothing to revise yet" }, { status: 400 });

  const [{ data: role }, { data: mp }] = await Promise.all([
    supabase.from("roles").select("company, role_title, must_haves, keywords").eq("id", artifact.role_id).single(),
    supabase.from("master_profile").select("data").eq("user_id", user.id).single<{ data: { raw?: string } | null }>(),
  ]);
  if (!role) return NextResponse.json({ error: "role not found" }, { status: 404 });
  const groundTruth = mp?.data?.raw ?? "";
  if (!groundTruth) return NextResponse.json({ error: "no master profile to ground against" }, { status: 409 });

  const { verdict } = await runSkill(reviseResume, {
    userId: user.id,
    data: { instruction, sectionId, role, profile: groundTruth, groundTruth, sections: doc.experience },
  });
  await logAgentRuns(user.id, verdict.runs, { skill: "revise_resume", judge: verdict });

  const out = parseModelJson<{ experience?: unknown; changes?: unknown }>(verdict.finalOutput ?? "");
  const revised = parseResumeDoc({ experience: out?.experience }).experience;
  if (revised.length === 0) return NextResponse.json({ error: "revise produced nothing usable" }, { status: 502 });

  // Enforce scope + locks + truth headers regardless of the model's output.
  const nextExperience: ResumeExperience[] = applyRevision(doc.experience, revised, { sectionId });
  const changes: ReviseChange[] = parseChanges(out?.changes);

  const nextContent = { ...(artifact.content as Record<string, unknown>), experience: nextExperience };
  const { error } = await supabase.from("artifacts").update({ content: nextContent }).eq("id", id);
  if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });

  // P4 calibration: accepting a tune is a directed correction of RO's draft.
  await supabase.from("decision_events").insert({ ...tuneAcceptEvent(id, instruction, sectionId), user_id: user.id });

  return NextResponse.json({ ok: true, content: nextContent, changes });
}

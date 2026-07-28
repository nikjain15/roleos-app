import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { runSkill } from "@/agent/skills/run";
import draftResume from "@/agent/skills/draft_resume";
import draftCover from "@/agent/skills/draft_cover";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import { logError } from "@/lib/log";
import { parseResumeDoc } from "@/lib/resume/doc";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
// The multi-minute draft (draft skill + the full truth gate). 300s = the ceiling
// the cron draft path uses. The studio polls this; the user watches live progress.
export const maxDuration = 300;

/**
 * Run the real draft for a `drafting` placeholder artifact (async drafting, kicked
 * off by the studio's DraftingPoller) — résumés AND cover letters, branched on the
 * artifact's type. Idempotent + soft-locked: a draft already in progress or already
 * finished is a no-op, so a reload / second tab won't double-draft. RLS-scoped;
 * meters every model call; on failure → 'error'. No send.
 */
const Params = z.object({ id: z.string().uuid() });
const LOCK_MS = 180_000; // a claimed draft is assumed in-flight ~3 min (a bit past a full draft)

async function runDraft(
  supabase: SupabaseClient,
  userId: string,
  artifact: { id: string; role_id: string; type: string },
  profileRaw: string,
): Promise<{ content: unknown; status: string; hasBody: boolean }> {
  if (artifact.type === "cover") {
    const [{ data: role }, { data: resumeArt }] = await Promise.all([
      supabase
        .from("roles")
        .select("id, company, role_title, must_haves, nice_to_haves")
        .eq("id", artifact.role_id)
        .single(),
      // Stay consistent with the résumé the user already approved for this role, if any.
      supabase
        .from("artifacts")
        .select("content")
        .eq("user_id", userId)
        .eq("role_id", artifact.role_id)
        .eq("type", "resume")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!role) throw new Error("role not found");
    const { verdict } = await runSkill(draftCover, {
      userId,
      data: { role, profile: profileRaw, groundTruth: profileRaw, resume: resumeArt?.content ?? undefined },
    });
    await logAgentRuns(userId, verdict.runs, { skill: "draft_cover", judge: verdict });
    const content: unknown = parseModelJson(verdict.finalOutput) ?? {};
    const status = verdict.status === "passed" ? "draft" : "needs_your_eyes";
    const body = (content as { body?: unknown } | null)?.body;
    await supabase
      .from("artifacts")
      .update({ content, provenance: { gate_status: verdict.status, truth: verdict.truth, critic: verdict.critic }, status })
      .eq("id", artifact.id);
    return { content, status, hasBody: typeof body === "string" && body.length > 0 };
  }

  const { data: role } = await supabase
    .from("roles")
    .select("id, company, role_title, must_haves, keywords")
    .eq("id", artifact.role_id)
    .single();
  if (!role) throw new Error("role not found");
  const { verdict } = await runSkill(draftResume, { userId, data: { role, profile: profileRaw, groundTruth: profileRaw } });
  await logAgentRuns(userId, verdict.runs, { skill: "draft_resume", judge: verdict });
  const content: unknown = parseModelJson(verdict.finalOutput) ?? {};
  const status = verdict.status === "passed" ? "draft" : "needs_your_eyes";
  await supabase
    .from("artifacts")
    .update({ content, provenance: { gate_status: verdict.status, truth: verdict.truth, critic: verdict.critic }, status })
    .eq("id", artifact.id);
  const doc = parseResumeDoc(content);
  return { content, status, hasBody: Boolean(doc.summary) || doc.experience.some((e) => e.lines.length > 0) };
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
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
    .select("id, role_id, type, status, content, provenance")
    .eq("id", id)
    .single<{ id: string; role_id: string | null; type: string; status: string; content: unknown; provenance: Record<string, unknown> | null }>();
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Only a fresh placeholder gets drafted; anything else is already done / running.
  if (artifact.status !== "drafting") return NextResponse.json({ status: artifact.status });
  const prov = artifact.provenance ?? {};
  const started = typeof prov.draft_started_at === "string" ? Date.parse(prov.draft_started_at) : NaN;
  if (Number.isFinite(started) && Date.now() - started < LOCK_MS) {
    return NextResponse.json({ status: "drafting", inProgress: true });
  }
  if (!artifact.role_id) return NextResponse.json({ error: "no role" }, { status: 400 });

  // Claim the draft (soft lock) so a reload / second tab won't double-run it.
  await supabase.from("artifacts").update({ provenance: { ...prov, draft_started_at: new Date().toISOString() } }).eq("id", id);

  const { data: mp } = await supabase.from("master_profile").select("data").eq("user_id", user.id).single();
  const profileRaw = (mp?.data as { raw?: string } | null)?.raw;
  if (!profileRaw) {
    await supabase.from("artifacts").update({ status: "error" }).eq("id", id);
    return NextResponse.json({ error: "missing profile" }, { status: 400 });
  }

  try {
    const { status, hasBody } = await runDraft(supabase, user.id, { id, role_id: artifact.role_id, type: artifact.type }, profileRaw);
    return NextResponse.json({ status, hasBody });
  } catch (err) {
    logError("tailor.draft_failed", err, { artifactId: id, type: artifact.type });
    await supabase.from("artifacts").update({ status: "error" }).eq("id", id);
    return NextResponse.json({ error: "draft failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { runSkill } from "@/agent/skills/run";
import draftResume from "@/agent/skills/draft_resume";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";
// The route now returns INSTANTLY (a 'drafting' placeholder); the multi-minute draft
// runs in the background via ctx.waitUntil, which still needs the worker alive for
// the full job — 300s matches the cron draft path (lib/hunt.ts), the proven ceiling.
export const maxDuration = 300;

/**
 * Gate 1 — tailor a résumé for one role (journey.html §5). ASYNC: creates a
 * `drafting` placeholder artifact and returns its id immediately, then RO drafts
 * in the background (draft_resume through the full quality gate incl. the truth
 * gate) and flips the status when ready. The studio page polls until it's done —
 * so the user never waits two minutes on a button. RLS-scoped; no send.
 */
type RoleRow = { id: string; company: string; role_title: string; must_haves: unknown; keywords: unknown };

/** The multi-minute draft — runs AFTER the response, so it uses the service-role
 *  client (the request/cookie context is gone). Metered; fails to 'error' status. */
async function draftInBackground(userId: string, artifactId: string, role: RoleRow, profileRaw: string): Promise<void> {
  const svc = supabaseService();
  try {
    const { verdict } = await runSkill(draftResume, {
      userId,
      data: { role, profile: profileRaw, groundTruth: profileRaw },
    });
    await logAgentRuns(userId, verdict.runs, { skill: "draft_resume", judge: verdict });
    const content: unknown = parseModelJson(verdict.finalOutput) ?? {};
    const status = verdict.status === "passed" ? "draft" : "needs_your_eyes";
    await svc
      .from("artifacts")
      .update({ content, provenance: { gate_status: verdict.status, truth: verdict.truth, critic: verdict.critic }, status })
      .eq("id", artifactId);
  } catch (err) {
    logError("tailor.background_failed", err, { artifactId });
    await svc.from("artifacts").update({ status: "error" }).eq("id", artifactId);
  }
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const rate = await checkRateLimit("tailor", user.id);
  if (!rate.allowed) {
    return rateLimitResponse("You've tailored a lot of résumés this hour — review what you have; it resets soon.");
  }

  const parsed = await validateBody(req, z.object({ roleId: z.string().uuid() }));
  if (!parsed.ok) return parsed.response;
  const { roleId } = parsed.data;

  const { data: mp } = await supabase.from("master_profile").select("data").eq("user_id", user.id).single();
  const profileRaw = (mp?.data as { raw?: string } | null)?.raw;
  if (!profileRaw) {
    return NextResponse.json({ error: "no master profile yet — run onboarding first" }, { status: 400 });
  }

  const { data: role, error: rErr } = await supabase
    .from("roles")
    .select("id, company, role_title, must_haves, keywords")
    .eq("id", roleId)
    .single<RoleRow>();
  if (rErr || !role) return NextResponse.json({ error: "role not found" }, { status: 404 });

  // Create the placeholder artifact and return its id NOW (no 2-min wait).
  const { data: artifact, error: aErr } = await supabase
    .from("artifacts")
    .insert({ user_id: user.id, role_id: roleId, type: "resume", content: {}, provenance: {}, status: "drafting" })
    .select("id")
    .single();
  if (aErr || !artifact) return NextResponse.json({ error: aErr?.message ?? "couldn't start" }, { status: 500 });

  // Draft in the background. On Workers, ctx.waitUntil keeps the worker alive past
  // the response; in dev (no CF ctx) fall back to running it inline so it still works.
  const draft = draftInBackground(user.id, artifact.id, role, profileRaw);
  let scheduled = false;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = getCloudflareContext()?.ctx as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
    if (ctx?.waitUntil) {
      ctx.waitUntil(draft);
      scheduled = true;
    }
  } catch {
    /* not on the Workers runtime */
  }
  if (!scheduled) await draft; // dev fallback: block until done

  return NextResponse.json({ artifactId: artifact.id, status: "drafting" });
}

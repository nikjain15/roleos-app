import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { runSkill } from "@/agent/skills/run";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import { logError } from "@/lib/log";
import coachPrep from "@/agent/skills/coach_prep";
import debrief from "@/agent/skills/debrief";
import { underCoachLimit } from "@/lib/coach-limit";

export const dynamic = "force-dynamic";
// Prep + debrief are reason-tier calls through the full gate (multi-minute).
export const maxDuration = 300;

/**
 * Run the heavy coach phases for one pipeline (async coach, kicked off by the
 * client's poller — same fire-and-poll shape as /api/artifact/[id]/draft).
 * `prep` fills a `prepping` placeholder; `debrief` scores the transcript.
 * Idempotent + soft-locked per phase, so a reload / second tab won't double-run.
 * RLS-scoped; meters every model call; rate-charged only when work actually
 * starts. No send.
 */
type Turn = { role: "interviewer" | "candidate"; text: string };
type Msgs = {
  status?: string;
  prep?: unknown;
  transcript?: Turn[];
  prep_started_at?: string;
  debrief_status?: string;
  debrief_started_at?: string;
};
const LOCK_MS = 240_000; // a claimed run is assumed in-flight ~4 min

const locked = (startedAt: unknown) => {
  const t = typeof startedAt === "string" ? Date.parse(startedAt) : NaN;
  return Number.isFinite(t) && Date.now() - t < LOCK_MS;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = z.object({ id: z.string().uuid() }).safeParse(await ctx.params);
  if (!params.success) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const { id } = params.data;

  const parsed = await validateBody(req, z.object({ phase: z.enum(["prep", "debrief"]) }));
  if (!parsed.ok) return parsed.response;
  const { phase } = parsed.data;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: pipe } = await supabase
    .from("pipeline")
    .select("id, role_id, messages, debriefs, roles(company, role_title, must_haves, scope)")
    .eq("id", id)
    .single<{
      id: string;
      role_id: string | null;
      messages: Msgs | null;
      debriefs: unknown[] | null;
      roles: { company: string; role_title: string; must_haves: unknown; scope: unknown } | null;
    }>();
  if (!pipe) return NextResponse.json({ error: "not found" }, { status: 404 });
  const msgs: Msgs = pipe.messages ?? {};

  if (phase === "prep") {
    // Only a fresh placeholder gets prepped; done/absent-status rows are legacy-complete.
    if (msgs.status !== "prepping" && msgs.status !== "error") {
      return NextResponse.json({ status: msgs.status ?? "ready" });
    }
    if (msgs.status === "prepping" && locked(msgs.prep_started_at)) {
      return NextResponse.json({ status: "prepping", inProgress: true });
    }
    if (!(await underCoachLimit(user.id))) {
      return NextResponse.json({ error: "coach budget for the hour is spent" }, { status: 429 });
    }
    await supabase
      .from("pipeline")
      .update({ messages: { ...msgs, status: "prepping", prep_started_at: new Date().toISOString() } })
      .eq("id", id);
    try {
      const { data: mp } = await supabase.from("master_profile").select("data").eq("user_id", user.id).single();
      const profile = ((mp?.data as { raw?: string } | null)?.raw) ?? "";
      const { verdict } = await runSkill(coachPrep, { userId: user.id, data: { role: pipe.roles, profile } });
      await logAgentRuns(user.id, verdict.runs, { skill: "coach_prep", judge: verdict });
      const prep = parseModelJson(verdict.finalOutput);
      await supabase
        .from("pipeline")
        .update({ messages: { ...msgs, status: "ready", prep, transcript: msgs.transcript ?? [] } })
        .eq("id", id);
      return NextResponse.json({ status: "ready" });
    } catch (err) {
      logError("coach.prep_failed", err, { pipelineId: id });
      await supabase.from("pipeline").update({ messages: { ...msgs, status: "error" } }).eq("id", id);
      return NextResponse.json({ error: "prep failed" }, { status: 500 });
    }
  }

  // phase === "debrief"
  if (msgs.debrief_status === "ready") return NextResponse.json({ status: "ready" });
  if (msgs.debrief_status === "running" && locked(msgs.debrief_started_at)) {
    return NextResponse.json({ status: "running", inProgress: true });
  }
  if (!(await underCoachLimit(user.id))) {
    return NextResponse.json({ error: "coach budget for the hour is spent" }, { status: 429 });
  }
  await supabase
    .from("pipeline")
    .update({ messages: { ...msgs, debrief_status: "running", debrief_started_at: new Date().toISOString() } })
    .eq("id", id);
  try {
    const transcript = msgs.transcript ?? [];
    const { verdict } = await runSkill(debrief, { userId: user.id, data: { role: pipe.roles, transcript } });
    await logAgentRuns(user.id, verdict.runs, { skill: "debrief", judge: verdict });
    const result = parseModelJson(verdict.finalOutput);
    await supabase
      .from("pipeline")
      .update({
        debriefs: [...(pipe.debriefs ?? []), result],
        messages: { ...msgs, debrief_status: "ready" },
      })
      .eq("id", id);
    // a completed mock is a real signal of effort/taste
    await supabase.from("decision_events").insert({
      user_id: user.id,
      kind: "coach",
      subject_ref: pipe.id,
      action: "view",
      payload: { phase: "debrief" },
    });
    return NextResponse.json({ status: "ready" });
  } catch (err) {
    logError("coach.debrief_failed", err, { pipelineId: id });
    await supabase.from("pipeline").update({ messages: { ...msgs, debrief_status: "error" } }).eq("id", id);
    return NextResponse.json({ error: "debrief failed" }, { status: 500 });
  }
}

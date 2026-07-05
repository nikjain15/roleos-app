import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { runSkill } from "@/agent/skills/run";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import coachPrep from "@/agent/skills/coach_prep";
import mockInterview from "@/agent/skills/mock_interview";
import debrief from "@/agent/skills/debrief";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// X8: every coach action is a model call — budget the hour per user. 60 turns
// comfortably covers two long mocks; a runaway voice loop can't burn past it.
const COACH_CALLS_PER_HOUR = 60;

async function underLimit(userId: string): Promise<boolean> {
  try {
    const db = supabaseService();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error } = await db
      .from("rate_events")
      .select("*", { count: "exact", head: true })
      .eq("scope", "coach")
      .eq("subject", userId)
      .gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) >= COACH_CALLS_PER_HOUR) return false;
    await db.from("rate_events").insert({ scope: "coach", subject: userId });
    return true;
  } catch {
    return true; // fail-open: an outage never blocks practice
  }
}

/**
 * Gate 4 — interview coach orchestration (journey.html §7). Coach mode: no
 * autonomy. prep → mock (multi-turn) → debrief. Transcript lives in the pipeline
 * table (RLS-scoped). The mock is a role-play persona (shape-only gate); the prep
 * + debrief are RO's own voice (full gate).
 */
type Turn = { role: "interviewer" | "candidate"; text: string };

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(
    req,
    z.object({
      action: z.enum(["prep", "mock_turn", "debrief"]),
      roleId: z.string().uuid().optional(),
      pipelineId: z.string().uuid().optional(),
      message: z.string().max(8_000).optional(),
    }),
  );
  if (!parsed.ok) return parsed.response;
  const body: Record<string, unknown> = parsed.data;
  const action = parsed.data.action;
  const uid = user.id;

  if (!(await underLimit(uid))) {
    return NextResponse.json(
      { error: "You've practiced hard this hour — take a breath; the coach resets soon." },
      { status: 429 },
    );
  }

  const profileRaw = async () =>
    ((await supabase.from("master_profile").select("data").eq("user_id", uid).single()).data?.data as {
      raw?: string;
    } | null)?.raw ?? "";

  try {
    if (action === "prep") {
      const roleId = String(body.roleId);
      const { data: role } = await supabase
        .from("roles")
        .select("id, company, role_title, must_haves, scope")
        .eq("id", roleId)
        .single();
      if (!role) return NextResponse.json({ error: "role not found" }, { status: 404 });

      const { verdict } = await runSkill(coachPrep, { userId: uid, data: { role, profile: await profileRaw() } });
      await logAgentRuns(uid, verdict.runs, { skill: "coach_prep", judge: verdict });
      const prep = parseModelJson(verdict.finalOutput);

      const { data: pipe } = await supabase
        .from("pipeline")
        .insert({ user_id: uid, role_id: roleId, stage: "coach", messages: { prep, transcript: [] } })
        .select("id")
        .single();
      return NextResponse.json({ pipelineId: pipe!.id, prep, role: { company: role.company, role_title: role.role_title } });
    }

    if (action === "mock_turn") {
      const { data: pipe } = await supabase
        .from("pipeline")
        .select("id, role_id, messages, roles(company, role_title, must_haves)")
        .eq("id", String(body.pipelineId))
        .single();
      if (!pipe) return NextResponse.json({ error: "not found" }, { status: 404 });

      const msgs = (pipe.messages as { prep?: unknown; transcript?: Turn[] }) ?? {};
      const transcript: Turn[] = msgs.transcript ?? [];
      if (body.message) transcript.push({ role: "candidate", text: String(body.message) });

      const { verdict } = await runSkill(mockInterview, {
        userId: uid,
        data: { role: pipe.roles, transcript },
      });
      await logAgentRuns(uid, verdict.runs, { skill: "mock_interview", judge: verdict });
      transcript.push({ role: "interviewer", text: verdict.finalOutput.trim() });

      await supabase.from("pipeline").update({ messages: { ...msgs, transcript } }).eq("id", pipe.id);
      return NextResponse.json({ interviewer: verdict.finalOutput.trim(), turns: transcript.length });
    }

    if (action === "debrief") {
      const { data: pipe } = await supabase
        .from("pipeline")
        .select("id, messages, debriefs, roles(company, role_title)")
        .eq("id", String(body.pipelineId))
        .single();
      if (!pipe) return NextResponse.json({ error: "not found" }, { status: 404 });
      const transcript = ((pipe.messages as { transcript?: Turn[] })?.transcript) ?? [];

      const { verdict } = await runSkill(debrief, { userId: uid, data: { role: pipe.roles, transcript } });
      await logAgentRuns(uid, verdict.runs, { skill: "debrief", judge: verdict });
      const result = parseModelJson(verdict.finalOutput);

      await supabase
        .from("pipeline")
        .update({ debriefs: [...((pipe.debriefs as unknown[]) ?? []), result] })
        .eq("id", pipe.id);
      // a completed mock is a real signal of effort/taste
      await supabase.from("decision_events").insert({
        user_id: uid,
        kind: "coach",
        subject_ref: pipe.id,
        action: "view",
        payload: { phase: "debrief" },
      });
      return NextResponse.json({ debrief: result });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "coach step failed" }, { status: 500 });
  }
}

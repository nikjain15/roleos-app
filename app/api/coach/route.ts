import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runSkill } from "@/agent/skills/run";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import coachPrep from "@/agent/skills/coach_prep";
import mockInterview from "@/agent/skills/mock_interview";
import debrief from "@/agent/skills/debrief";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

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

  const body = (await req.json()) as Record<string, unknown>;
  const action = body.action as string;
  const uid = user.id;

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

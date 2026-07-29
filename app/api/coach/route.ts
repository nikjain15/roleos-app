import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { runSkill } from "@/agent/skills/run";
import { logAgentRuns } from "@/lib/agent-runs";
import mockInterview from "@/agent/skills/mock_interview";
import { underCoachLimit } from "@/lib/coach-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * Gate 4 — interview coach orchestration (journey.html §7). Coach mode: no
 * autonomy. prep → mock (multi-turn) → debrief. Transcript lives in the pipeline
 * table (RLS-scoped). The mock is a role-play persona (shape-only gate); the prep
 * + debrief are RO's own voice (full gate).
 *
 * ASYNC (J12 latency): `prep` only creates a `prepping` placeholder pipeline row
 * and returns instantly; the client kicks /api/coach/[id]/run and polls
 * /api/coach/[id]/status (same fire-and-poll shape as tailoring). Debrief is
 * kicked directly on the run route. Only `mock_turn` — one short conversational
 * call — stays synchronous here.
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
      action: z.enum(["prep", "mock_turn"]),
      roleId: z.string().uuid().optional(),
      pipelineId: z.string().uuid().optional(),
      message: z.string().max(8_000).optional(),
    }),
  );
  if (!parsed.ok) return parsed.response;
  const body: Record<string, unknown> = parsed.data;
  const action = parsed.data.action;
  const uid = user.id;

  if (!(await underCoachLimit(uid))) {
    return NextResponse.json(
      { error: "You've practiced hard this hour — take a breath; the coach resets soon." },
      { status: 429 },
    );
  }

  try {
    if (action === "prep") {
      // ASYNC: validate + create the placeholder INSTANTLY; the model call runs
      // via /api/coach/[id]/run, polled by the client. The rate charge above
      // covers the one prep call this kick will trigger.
      const roleId = String(body.roleId);
      const { data: role } = await supabase
        .from("roles")
        .select("id, company, role_title")
        .eq("id", roleId)
        .single();
      if (!role) return NextResponse.json({ error: "role not found" }, { status: 404 });

      const { data: pipe } = await supabase
        .from("pipeline")
        .insert({ user_id: uid, role_id: roleId, stage: "coach", messages: { status: "prepping", transcript: [] } })
        .select("id")
        .single();
      return NextResponse.json({
        pipelineId: pipe!.id,
        status: "prepping",
        role: { company: role.company, role_title: role.role_title },
      });
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

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "coach step failed" }, { status: 500 });
  }
}

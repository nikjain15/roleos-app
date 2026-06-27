import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runSkill } from "@/agent/skills/run";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import {
  authenticityGate,
  provenanceSplit,
  type BuildContent,
  type BuildSection,
} from "@/lib/build";
import decodeBrief from "@/agent/skills/build/decode_brief";
import setBet from "@/agent/skills/build/set_bet";
import buildSpine from "@/agent/skills/build/build_spine";
import injectEdge from "@/agent/skills/build/inject_edge";
import weaveEdge from "@/agent/skills/build/weave_edge";
import pressureTest from "@/agent/skills/build/pressure_test";
import type { Skill, SkillInput } from "@/agent/skills/skill";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Build studio (gate 3) orchestration — one action-dispatched route. RLS-scoped;
 * each phase runs skills through the quality gate, mutates the build artifact,
 * and logs agent_runs. Submit is enforced by the authenticity gate (no 100%-RO
 * artifact). No send happens here — submit makes it ready; sending is separate.
 */

async function run(skill: Skill, input: SkillInput, userId: string) {
  const { verdict } = await runSkill(skill, input);
  await logAgentRuns(userId, verdict.runs, { skill: skill.id, judge: verdict });
  return parseModelJson<Record<string, unknown>>(verdict.finalOutput);
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const action = body.action as string;
  const uid = user.id;

  // helper: load + persist a build artifact's content (RLS-scoped)
  const load = async (id: string) => {
    const { data } = await supabase.from("artifacts").select("id, content").eq("id", id).single();
    return data as { id: string; content: BuildContent } | null;
  };
  const save = async (id: string, content: BuildContent) => {
    const prov = provenanceSplit(content.sections);
    await supabase.from("artifacts").update({ content, provenance: prov }).eq("id", id);
    return prov;
  };

  try {
    switch (action) {
      case "start": {
        const brief = String(body.brief ?? "");
        const canvasType = (body.canvasType as "prd" | "case_study") ?? "prd";
        if (brief.trim().length < 30) {
          return NextResponse.json({ error: "give RO the brief to work from" }, { status: 400 });
        }
        const role = body.roleId
          ? (await supabase.from("roles").select("company, role_title").eq("id", body.roleId).single()).data
          : null;

        const decode = await run(decodeBrief, { userId: uid, data: { brief, role } }, uid);
        const bet = await run(setBet, { userId: uid, data: { brief, decode } }, uid);

        const content: BuildContent = {
          canvas_type: canvasType,
          brief,
          phase: 2,
          decode,
          angles: (bet?.angles as unknown[]) ?? [],
          sections: [],
        };
        const { data: art } = await supabase
          .from("artifacts")
          .insert({
            user_id: uid,
            role_id: body.roleId ?? null,
            type: "build",
            content,
            provenance: { your_pct: 0, ro_pct: 100 },
            status: "draft",
          })
          .select("id")
          .single();
        return NextResponse.json({ sessionId: art!.id, content });
      }

      case "choose_bet": {
        const s = await load(String(body.sessionId));
        if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
        const c = s.content;
        c.bet =
          body.customBet ??
          (typeof body.angleIndex === "number" ? c.angles?.[body.angleIndex] : c.angles?.[0]);

        const spine = await run(
          buildSpine,
          { userId: uid, data: { brief: c.brief, bet: c.bet, rubric: c.decode, canvasType: c.canvas_type } },
          uid,
        );
        c.sections = ((spine?.sections as BuildSection[]) ?? []).map((x) => ({
          ...x,
          provenance: "ro" as const,
        }));

        const q = await run(
          injectEdge,
          { userId: uid, data: { brief: c.brief, bet: c.bet, sections: c.sections } },
          uid,
        );
        c.edge = { question: q?.question as string, why: q?.why as string, weaved: false };
        c.phase = 4;
        await save(s.id, c);
        return NextResponse.json({ content: c });
      }

      case "answer_edge": {
        const s = await load(String(body.sessionId));
        if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
        const c = s.content;
        const answer = String(body.answer ?? "");
        // weave_edge with truth gate grounded on THEIR answer (can't invent a sharper idea)
        const { verdict } = await runSkill(weaveEdge, {
          userId: uid,
          data: { question: c.edge?.question, answer, groundTruth: answer },
        });
        await logAgentRuns(uid, verdict.runs, { skill: weaveEdge.id, judge: verdict });
        const woven = parseModelJson<{ section?: BuildSection }>(verdict.finalOutput);
        if (woven?.section) {
          c.sections.push({ ...woven.section, id: "your-edge", provenance: "you" });
        }
        c.edge = { ...c.edge, answer, weaved: true };
        c.phase = 6;
        // injecting your own thinking is a high-weight signal
        await supabase.from("decision_events").insert({
          user_id: uid,
          kind: "build",
          subject_ref: s.id,
          action: "edit",
          payload: { phase: "inject_edge" },
          weight: 3,
        });
        const prov = await save(s.id, c);
        return NextResponse.json({ content: c, provenance: prov });
      }

      case "pressure_test": {
        const s = await load(String(body.sessionId));
        if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
        const c = s.content;
        const pt = await run(
          pressureTest,
          { userId: uid, data: { rubric: c.decode, sections: c.sections } },
          uid,
        );
        c.pressure = {
          attacks: (pt?.attacks as unknown[]) ?? [],
          verdict: pt?.verdict as string,
          note: pt?.note as string,
        };
        c.phase = 6;
        await save(s.id, c);
        return NextResponse.json({ content: c });
      }

      case "edit_section": {
        const s = await load(String(body.sessionId));
        if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
        const c = s.content;
        const sec = c.sections.find((x) => x.id === body.sectionId);
        if (sec) {
          sec.body = String(body.body ?? sec.body);
          sec.provenance = "you"; // they made it theirs
        }
        await supabase.from("decision_events").insert({
          user_id: uid,
          kind: "build",
          subject_ref: s.id,
          action: "edit",
          payload: { section: body.sectionId },
          weight: 3,
        });
        const prov = await save(s.id, c);
        return NextResponse.json({ content: c, provenance: prov });
      }

      case "submit": {
        const s = await load(String(body.sessionId));
        if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
        const gate = authenticityGate(s.content);
        if (!gate.ok) {
          return NextResponse.json({ ok: false, gate });
        }
        await supabase.from("artifacts").update({ status: "approved" }).eq("id", s.id);
        await supabase.from("decision_events").insert({
          user_id: uid,
          kind: "build",
          subject_ref: s.id,
          action: "approve",
          payload: { phase: "submit" },
          weight: 1,
        });
        return NextResponse.json({ ok: true, gate });
      }

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "build step failed" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runSkill } from "@/agent/skills/run";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import negotiate from "@/agent/skills/negotiate";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * Gate 5 — negotiation (journey.html §7, auto → you send). RO parses the offer,
 * benchmarks, models levers, and drafts the counter + leverage narrative. Persists
 * a 'counter' artifact (RLS). NO send — the user sends from the studio (the only
 * outbound path is the separate, user-clicked dispatch route).
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { offer, roleId } = (await req.json()) as { offer?: string; roleId?: string };
  if (!offer || offer.trim().length < 20) {
    return NextResponse.json({ error: "paste the offer details for RO to work from" }, { status: 400 });
  }

  const profileRaw =
    ((await supabase.from("master_profile").select("data").eq("user_id", user.id).single()).data?.data as {
      raw?: string;
    } | null)?.raw ?? "(no profile yet)";
  const role = roleId
    ? (await supabase.from("roles").select("company, role_title, comp").eq("id", roleId).single()).data
    : null;

  const { verdict } = await runSkill(negotiate, {
    userId: user.id,
    data: { offer, role, profile: profileRaw },
  });
  await logAgentRuns(user.id, verdict.runs, { skill: "negotiate", judge: verdict });
  const result = parseModelJson(verdict.finalOutput);

  const { data: art } = await supabase
    .from("artifacts")
    .insert({
      user_id: user.id,
      role_id: roleId ?? null,
      type: "counter",
      content: result ?? {},
      provenance: { gate_status: verdict.status },
      status: verdict.status === "passed" ? "draft" : "needs_your_eyes",
    })
    .select("id")
    .single();

  return NextResponse.json({ artifactId: art?.id, result, status: verdict.status });
}

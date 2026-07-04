import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { loadActiveGoal } from "@/lib/goal";
import { runSkill } from "@/agent/skills/run";
import roAsk from "@/agent/skills/ro_ask";
import { logAgentRuns } from "@/lib/agent-runs";
import { parseModelJson } from "@/lib/json";
import { validateAct, type RawAct } from "@/lib/dock-acts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * RO-everywhere dock ask/act layer (buildplan §3). Answers a question grounded in
 * the user's OWN state (goal + pipeline counts + screen), via the metered registry.
 * RLS-scoped; zod-validated. Actions are proposed, never executed — the route
 * returns an in-app link the user clicks (human-gated-outward: this imports no send
 * tool, and the suggested href is whitelisted server-side).
 */
const BodySchema = z.object({
  question: z.string().min(2).max(500),
  screen: z.string().max(80).optional(),
});

const ALLOWED_HREFS = new Set([
  "/feed", "/goal", "/roles", "/tracker", "/studio/coach", "/studio/build", "/watch",
]);

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { question, screen } = parsed.data;

  // Gather the user's real state (RLS-scoped) — the only grounding for the answer.
  const { goal, plan } = await loadActiveGoal(supabase);
  const [matchAgg, appAgg, readyAgg] = await Promise.all([
    supabase.from("matches").select("role_id, recommendation, status, fit_score, roles(company, role_title)").limit(1000),
    supabase.from("applications").select("stage").limit(1000),
    supabase.from("artifacts").select("id", { count: "exact", head: true }).eq("status", "approved"),
  ]);

  type MatchRow = {
    role_id: string;
    recommendation: string | null;
    status: string;
    fit_score: number | null;
    roles: { company: string; role_title: string } | null;
  };
  const matches = (matchAgg.data ?? []) as unknown as MatchRow[];
  const apps = appAgg.data ?? [];
  const stageCount = (s: string) => apps.filter((a) => a.stage === s).length;

  // The user's own top pursue candidates — the ONLY roles a tailor act may name
  // (W3: a model-proposed roleId outside this set is dropped by validateAct).
  const topPursue = matches
    .filter((m) => m.recommendation === "pursue" && m.status !== "dismissed" && m.roles)
    .sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1))
    .slice(0, 5)
    .map((m) => ({ id: m.role_id, company: m.roles!.company, title: m.roles!.role_title }));

  const state = {
    top_pursue: topPursue,
    goal: goal
      ? {
          target: goal.target?.archetype ?? null,
          deadline: goal.deadline_date ?? null,
          verdict: plan?.feasibility.verdict ?? null,
          weekly_apps_target: plan?.weekly.applications ?? null,
          best_lever: plan?.feasibility.bestLever ?? null,
        }
      : null,
    pipeline: {
      pursue_matches: matches.filter((m) => m.recommendation === "pursue" && m.status !== "dismissed").length,
      saved: matches.filter((m) => m.status === "saved" || m.status === "pursuing").length,
      applied: stageCount("applied"),
      interviewing: stageCount("screening") + stageCount("interviewing") + stageCount("onsite"),
      offers: stageCount("offer"),
      resumes_ready: readyAgg.count ?? 0,
    },
  };

  try {
    const { verdict } = await runSkill(roAsk, {
      userId: user.id,
      data: { question, screen: screen ?? "unknown", state },
    });
    await logAgentRuns(user.id, verdict.runs, { skill: roAsk.id });

    const out = parseModelJson<{
      answer?: string;
      action?: { label?: string; href?: string } | null;
      act?: RawAct | null;
    }>(verdict.finalOutput);
    const answer = out?.answer ?? verdict.finalOutput;
    // Whitelist the suggested action href (defense-in-depth: never a foreign link).
    const action =
      out?.action && out.action.href && ALLOWED_HREFS.has(out.action.href) && out.action.label
        ? { label: String(out.action.label).slice(0, 40), href: out.action.href }
        : null;
    // W3 act-verbs: validate everything the model proposed. A tailor act may only
    // name one of the user's OWN top-pursue roles; filter params are sanitized to
    // a whitelisted /roles?… href. Executing either still takes a USER click.
    const act = validateAct(out?.act, topPursue);

    return NextResponse.json({ answer, action: act ? null : action, act, grounded: verdict.status });
  } catch {
    return NextResponse.json({ error: "RO couldn't answer that one — try again." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";
import { recallRoles } from "@/lib/match";
import { mhText } from "@/lib/explore";
import { runSkill } from "@/agent/skills/run";
import indexQa from "@/agent/skills/index_qa";
import { logAgentRuns } from "@/lib/agent-runs";
import { suggestFollowups } from "@/lib/followups";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Anon "Ask RO about the Index" (docs/explore-index.md Phase 2). PUBLIC — no auth.
 * Grounds the answer in real roles (the page's scope, else pgvector recall) and
 * answers via the index_qa skill. IP rate-limited (it calls Claude). No send.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Scope = { company?: string; archetype?: string } | undefined;

function compact(r: Record<string, unknown>) {
  const loc = r.location as { name?: string } | string | null;
  return {
    id: r.id as string,
    company: r.company as string,
    role_title: r.role_title as string,
    archetype: (r.archetype as string) ?? null,
    location: typeof loc === "string" ? loc : (loc?.name ?? null),
    must_haves: mhText(r.must_haves),
  };
}

async function contextRoles(question: string, scope: Scope) {
  const db = supabaseService();
  const cols = "id, company, role_title, archetype, location, must_haves";
  if (scope?.company) {
    const { data } = await db.from("roles").select(cols).eq("company", scope.company).limit(30);
    return (data ?? []).map(compact);
  }
  if (scope?.archetype) {
    const { data } = await db.from("roles").select(cols).eq("archetype", scope.archetype).limit(30);
    return (data ?? []).map(compact);
  }
  const hits = await recallRoles(question, 8);
  return hits.map((r) => compact(r as unknown as Record<string, unknown>));
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    scope?: Scope;
    history?: Array<{ q?: string; a?: string }>;
  };
  const question = (body.question ?? "").trim().slice(0, 500);
  const history = Array.isArray(body.history) ? body.history.slice(-4) : [];
  if (question.length < 3) {
    return NextResponse.json({ error: "Ask a question about the Index." }, { status: 400 });
  }

  // H3: shared limiter (same 20/hour-per-IP budget as before; the legacy
  // index_ask_events table stays in place — no destructive change).
  const rate = await checkRateLimit("explore_ask", clientIp(req));
  if (!rate.allowed) {
    return rateLimitResponse(
      "You've asked RO a lot in the last hour — share your profile to keep going with RO directly.",
    );
  }

  try {
    const roles = await contextRoles(question, body.scope);
    const scopeLabel = body.scope?.company ?? (body.scope?.archetype ? `${body.scope.archetype} roles` : "");
    const { verdict } = await runSkill(indexQa, {
      userId: "anon",
      data: { question, roles, scopeLabel, history },
    });
    await logAgentRuns(null, verdict.runs, { skill: indexQa.id });

    const cited = roles.slice(0, 5).map((r) => ({ id: r.id, company: r.company, role_title: r.role_title }));
    const asked = [...history.map((h) => h.q ?? ""), question];
    const followups = suggestFollowups(body.scope, cited.length > 0, asked);
    return NextResponse.json({ answer: verdict.finalOutput, cited, followups });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "RO couldn't answer that one." },
      { status: 500 },
    );
  }
}

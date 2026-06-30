import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";
import { recallRoles } from "@/lib/match";
import { mhText } from "@/lib/explore";
import { runSkill } from "@/agent/skills/run";
import indexQa from "@/agent/skills/index_qa";
import { logAgentRuns } from "@/lib/agent-runs";

/**
 * Anon "Ask RO about the Index" (docs/explore-index.md Phase 2). PUBLIC — no auth.
 * Grounds the answer in real roles (the page's scope, else pgvector recall) and
 * answers via the index_qa skill. IP rate-limited (it calls Claude). No send.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_MIN = 60;
const MAX_PER_WINDOW = 20;

type Scope = { company?: string; archetype?: string } | undefined;

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

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
  const body = (await req.json().catch(() => ({}))) as { question?: string; scope?: Scope };
  const question = (body.question ?? "").trim().slice(0, 500);
  if (question.length < 3) {
    return NextResponse.json({ error: "Ask a question about the Index." }, { status: 400 });
  }

  const db = supabaseService();
  const ip = clientIp(req);

  // Rolling-window IP rate limit.
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count } = await db
    .from("index_ask_events")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_WINDOW) {
    return NextResponse.json(
      { error: "You've asked RO a lot in the last hour — share your profile to keep going with RO directly." },
      { status: 429 },
    );
  }
  await db.from("index_ask_events").insert({ ip });

  try {
    const roles = await contextRoles(question, body.scope);
    const scopeLabel = body.scope?.company ?? (body.scope?.archetype ? `${body.scope.archetype} roles` : "");
    const { verdict } = await runSkill(indexQa, {
      userId: "anon",
      data: { question, roles, scopeLabel },
    });
    await logAgentRuns(null, verdict.runs, { skill: indexQa.id });

    const cited = roles.slice(0, 5).map((r) => ({ id: r.id, company: r.company, role_title: r.role_title }));
    return NextResponse.json({ answer: verdict.finalOutput, cited });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "RO couldn't answer that one." },
      { status: 500 },
    );
  }
}

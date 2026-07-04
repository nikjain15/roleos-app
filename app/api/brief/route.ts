import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { validateBody } from "@/lib/validate";
import { runSkill } from "@/agent/skills/run";
import companyBrief from "@/agent/skills/company_brief";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * X2 — company research brief. Auth → rate limit → gather FIRST-PARTY rows
 * only (company + its stored postings + the target role; zero egress) → skill
 * (metered, full gate) → store as notification (kind `company_brief`) → return.
 * Rendering a stored brief is free; regenerating is the user's click.
 */
const BodySchema = z.object({ roleId: z.string().uuid() });
const BRIEFS_PER_HOUR = 6;

async function underLimit(userId: string): Promise<boolean> {
  try {
    const db = supabaseService();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error } = await db
      .from("rate_events")
      .select("*", { count: "exact", head: true })
      .eq("scope", "company_brief")
      .eq("subject", userId)
      .gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) >= BRIEFS_PER_HOUR) return false;
    await db.from("rate_events").insert({ scope: "company_brief", subject: userId });
    return true;
  } catch {
    return true; // fail-open
  }
}

export interface CompanyBrief {
  overview: string;
  hiring_signal: string;
  what_they_value: string[];
  comp_read: string;
  prep_pointers: string[];
  unknowns: string[];
  company: string;
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { roleId } = parsed.data;

  if (!(await underLimit(user.id))) {
    return NextResponse.json(
      { error: "You've pulled a lot of briefs this hour — read what you have; it resets soon." },
      { status: 429 },
    );
  }

  const service = supabaseService(); // role/company data is global, not user-owned
  const { data: role } = await service
    .from("roles")
    .select("id, company, role_title, must_haves, nice_to_haves, comp")
    .eq("id", roleId)
    .maybeSingle();
  if (!role) return NextResponse.json({ error: "role not found" }, { status: 404 });

  const [{ data: companyRow }, { data: postings }] = await Promise.all([
    service.from("companies").select("name, sector, yc_batch, homepage, ats_provider").eq("name", role.company).maybeSingle(),
    service.from("roles").select("role_title, must_haves, comp").eq("company", role.company).limit(50),
  ]);

  const { verdict } = await runSkill(companyBrief, {
    userId: user.id,
    data: {
      company: companyRow ?? { name: role.company },
      postings: postings ?? [],
      role: { role_title: role.role_title, must_haves: role.must_haves },
    },
  });
  await logAgentRuns(user.id, verdict.runs, { skill: "company_brief", judge: verdict });

  const brief = parseModelJson<Omit<CompanyBrief, "company">>(verdict.finalOutput);
  if (!brief?.overview) {
    return NextResponse.json({ error: "RO couldn't ground a brief — try again" }, { status: 500 });
  }
  const stored: CompanyBrief = {
    overview: brief.overview,
    hiring_signal: brief.hiring_signal ?? "",
    what_they_value: (brief.what_they_value ?? []).slice(0, 5),
    comp_read: brief.comp_read ?? "",
    prep_pointers: (brief.prep_pointers ?? []).slice(0, 4),
    unknowns: (brief.unknowns ?? []).slice(0, 4),
    company: role.company as string,
  };

  await supabase.from("notifications").insert({
    user_id: user.id,
    kind: "company_brief",
    tier: "in_feed",
    title: `Brief · ${stored.company}`,
    body: stored.overview,
    payload: stored,
    status: "read", // reference material, not an interruption
  });

  return NextResponse.json({ ok: true, brief: stored });
}

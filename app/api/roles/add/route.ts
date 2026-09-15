import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { runSkill } from "@/agent/skills/run";
import extractRole from "@/agent/skills/extract_role";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import { normalizeArchetype } from "@/lib/ingest/archetype";
import { normalizeJobUrl, USER_ROLE_DESCRIPTION_MAX } from "@/lib/user-roles";
import { logWarn, errorFields } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Bring your own role — the user pastes a job they found themselves (typically
 * a LinkedIn posting: title, company, JD text, link) and RO structures it so
 * the existing tailor pipeline (/api/tailor → studio) can run against it.
 *
 * Ownership + privacy: the row is written with the SERVICE client (roles are
 * corpus-writable only) but stamped `added_by = auth.uid()`, and the RLS select
 * policy (0028) hides it from every other user. It gets NO embedding row, so it
 * never enters anyone's recall, distance stats, or overnight hunt — the user
 * already chose it. A `matches` row (status 'saved', no invented fit score) is
 * inserted with the USER client so the role shows up in their workspace.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const rate = await checkRateLimit("role_add", user.id);
  if (!rate.allowed) {
    return rateLimitResponse("You've added a lot of roles this hour — it resets soon.");
  }

  const parsed = await validateBody(
    req,
    z.object({
      title: z.string().min(2).max(200),
      company: z.string().min(1).max(120),
      description: z.string().min(80, "paste the full job description").max(30_000),
      url: z.string().max(500).optional(),
    }),
  );
  if (!parsed.ok) return parsed.response;
  const { title, company } = parsed.data;
  const description = parsed.data.description.slice(0, USER_ROLE_DESCRIPTION_MAX);
  const url = parsed.data.url ? normalizeJobUrl(parsed.data.url) : null;

  // Same posting pasted twice → reuse the row the user can already see (their
  // own added roles or the corpus; RLS scopes this read).
  if (url) {
    const { data: dupe } = await supabase.from("roles").select("id").eq("url", url).limit(1).maybeSingle();
    if (dupe) {
      await ensureMatch(supabase, user.id, dupe.id as string);
      return NextResponse.json({ roleId: dupe.id, existing: true });
    }
  }

  // Structure the JD (best-effort — tailoring reads `description` either way).
  let structured: {
    archetype?: string;
    seniority?: string;
    must_haves?: unknown;
    nice_to_haves?: unknown;
    keywords?: unknown;
  } | null = null;
  try {
    const { verdict, routing } = await runSkill(extractRole, {
      userId: user.id,
      data: { title, company, description },
    });
    await logAgentRuns(user.id, verdict.runs, { skill: extractRole.id, routing });
    structured = parseModelJson(verdict.finalOutput);
  } catch {
    /* keep going unstructured */
  }
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);

  const db = supabaseService();
  const { data: role, error } = await db
    .from("roles")
    .insert({
      company,
      role_title: title,
      url,
      source: "user",
      added_by: user.id,
      description,
      archetype: normalizeArchetype(structured?.archetype),
      seniority: structured?.seniority ? { level: structured.seniority } : null,
      must_haves: arr(structured?.must_haves),
      nice_to_haves: arr(structured?.nice_to_haves),
      keywords: arr(structured?.keywords),
      fetched_at: new Date().toISOString().slice(0, 10),
      doc: { title, company, description, source: "user", url, ...(structured ?? {}) },
    })
    .select("id")
    .single();
  if (error || !role) return NextResponse.json({ error: error?.message ?? "couldn't save the role" }, { status: 500 });

  await ensureMatch(supabase, user.id, role.id as string);
  return NextResponse.json({ roleId: role.id });
}

/** Surface the role in the user's workspace — saved, honestly unscored. */
async function ensureMatch(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  roleId: string,
): Promise<void> {
  const { error } = await supabase.from("matches").insert({
    user_id: userId,
    role_id: roleId,
    status: "saved",
    recommendation: null,
    fit_score: null,
    reasoning: { why: "You brought this role in yourself — RO hasn't scored it." },
  });
  // 23505 = already in the workspace (unique user_id, role_id) — that's fine.
  // Any other failure is non-fatal: the role exists and tailoring still works.
  if (error && error.code !== "23505") {
    logWarn("roles.add match insert failed", { userId, roleId, ...errorFields(error) });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { runSkill } from "@/agent/skills/run";
import introAsk from "@/agent/skills/intro_ask";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Draft a warm-intro / referral ask (slice X6) — the user's own connection ×
 * one pursued role, through the FULL quality gate (truth gate grounded in the
 * master profile + the user's own relationship note). Persists as an `intro`
 * artifact; the USER sends it from their own email (compose handoff) — no
 * transport here, ever. Rate-limited like every model route.
 */
const ASKS_PER_HOUR = 8;

async function underLimit(userId: string): Promise<boolean> {
  try {
    const db = supabaseService();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error } = await db
      .from("rate_events")
      .select("*", { count: "exact", head: true })
      .eq("scope", "intro_ask")
      .eq("subject", userId)
      .gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) >= ASKS_PER_HOUR) return false;
    await db.from("rate_events").insert({ scope: "intro_ask", subject: userId });
    return true;
  } catch {
    return true; // fail-open: an outage never blocks the user
  }
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(
    req,
    z.object({ connectionId: z.string().uuid(), roleId: z.string().uuid() }),
  );
  if (!parsed.ok) return parsed.response;
  const { connectionId, roleId } = parsed.data;

  if (!(await underLimit(user.id))) {
    return NextResponse.json(
      { error: "You've drafted a lot of asks this hour — send the ones you have; it resets soon." },
      { status: 429 },
    );
  }

  // RLS: only the caller's own connection resolves here.
  const { data: connection } = await supabase
    .from("connections")
    .select("id, name, company, title, email, note, source")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection) return NextResponse.json({ error: "connection not found" }, { status: 404 });

  const { data: role } = await supabase
    .from("roles")
    .select("id, company, role_title")
    .eq("id", roleId)
    .maybeSingle();
  if (!role) return NextResponse.json({ error: "role not found" }, { status: 404 });

  const { data: mp } = await supabase.from("master_profile").select("data").eq("user_id", user.id).single();
  const profileRaw = (mp?.data as { raw?: string } | null)?.raw;
  if (!profileRaw) {
    return NextResponse.json({ error: "no master profile yet — run onboarding first" }, { status: 400 });
  }

  // The relationship note is user input crossing an AI surface — the skill is
  // instructed to treat it as relationship truth ONLY, and the truth gate
  // checks the output against profile + note (groundTruth).
  const { verdict } = await runSkill(introAsk, {
    userId: user.id,
    data: {
      role,
      connection,
      profile: profileRaw,
      groundTruth: `${profileRaw}\n\nRELATIONSHIP NOTE ABOUT ${connection.name}:\n${connection.note || "(none)"}`,
    },
  });
  await logAgentRuns(user.id, verdict.runs, { skill: "intro_ask", judge: verdict });

  const content = (parseModelJson(verdict.finalOutput) ?? {}) as Record<string, unknown>;
  const status = verdict.status === "passed" ? "draft" : "needs_your_eyes";

  const { data: artifact, error: aErr } = await supabase
    .from("artifacts")
    .insert({
      user_id: user.id,
      role_id: roleId,
      type: "intro",
      content: { ...content, connection_id: connection.id, connection_name: connection.name },
      provenance: { gate_status: verdict.status, truth: verdict.truth, critic: verdict.critic },
      status,
    })
    .select("id")
    .single();
  if (aErr || !artifact) return NextResponse.json({ error: "couldn't save the draft" }, { status: 500 });

  return NextResponse.json({
    ok: true,
    artifactId: artifact.id,
    status,
    content,
    truth: verdict.truth,
    email: connection.email,
  });
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { gmailRecent, calendarUpcoming } from "@/lib/google";
import { runSkill } from "@/agent/skills/run";
import classifyRecruiter from "@/agent/skills/gate2/classify_recruiter";
import { logAgentRuns } from "@/lib/agent-runs";
import { parseModelJson } from "@/lib/json";
import {
  assembleDesk,
  DEFAULT_SLOT_PREFS,
  type DeskEmail,
  type DeskRole,
  type RecruiterCategory,
} from "@/lib/reply-desk";

/**
 * X9 — reply desk assembly (docs/specs/x9-reply-desk.md). Reads recruiter mail +
 * calendar (Gate-2 readonly), classifies each inbound, and assembles the ranked
 * desk of threads waiting on the user — scheduling rows carry conflict-free
 * calendar slots. DRAFTS only: the drafted reply is fetched per-row from the
 * existing /api/recruiter draft_reply; NOTHING is sent here (Gate-2 you-send is
 * untouched). RLS-scoped reads.
 *
 * Deferred to a follow-up slice (called out, not silently cut): SLA-derived
 * follow-up-overdue and thank-you rows — the pure assembler already accepts them
 * (`signals`), but the SLA source isn't wired yet, so we pass none today.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VALID: ReadonlySet<RecruiterCategory> = new Set([
  "intro",
  "screening",
  "scheduling",
  "comp",
  "status",
  "rejection",
  "offer",
  "other",
]);

export async function POST(): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const uid = user.id;

  const token = await getGoogleAccessToken(uid);
  if (!token) return NextResponse.json({ connected: false, rows: [] });

  try {
    const [emails, availability, { data: roleRows }] = await Promise.all([
      gmailRecent(token, 12),
      calendarUpcoming(token, 12).catch(() => []),
      supabase
        .from("roles")
        .select("id, company, role_title")
        .limit(200)
        .returns<DeskRole[]>(),
    ]);

    // Classify each inbound (cheap Haiku), in parallel — reuse the Gate-2 skill.
    const classified: DeskEmail[] = await Promise.all(
      emails.map(async (e) => {
        const { verdict } = await runSkill(classifyRecruiter, {
          userId: uid,
          data: { from: e.from, subject: e.subject, body: e.body },
        });
        await logAgentRuns(uid, verdict.runs, { skill: classifyRecruiter.id, judge: verdict });
        const c = parseModelJson<{ category?: unknown; needs_reply?: unknown }>(verdict.finalOutput);
        const category = (typeof c?.category === "string" && VALID.has(c.category as RecruiterCategory)
          ? c.category
          : "other") as RecruiterCategory;
        return {
          id: e.id,
          from: e.from,
          subject: e.subject,
          date: e.date,
          body: e.body,
          category,
          needsReply: c?.needs_reply === true,
        };
      }),
    );

    const rows = assembleDesk(
      classified,
      availability,
      roleRows ?? [],
      [], // SLA signals: deferred (see module header)
      new Date().toISOString(),
      DEFAULT_SLOT_PREFS,
    );
    return NextResponse.json({ connected: true, rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "reply-desk scan failed" },
      { status: 500 },
    );
  }
}

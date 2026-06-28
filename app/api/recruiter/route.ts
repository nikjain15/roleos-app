import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { gmailRecent, calendarUpcoming } from "@/lib/google";
import { runSkill } from "@/agent/skills/run";
import classifyRecruiter from "@/agent/skills/gate2/classify_recruiter";
import screeningAnswer from "@/agent/skills/gate2/screening_answer";
import recruiterReply from "@/agent/skills/gate2/recruiter_reply";
import { logAgentRuns } from "@/lib/agent-runs";
import { parseModelJson } from "@/lib/json";
import type { Skill, SkillInput } from "@/agent/skills/skill";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Gate 2 — screening / recruiter (journey §7, Flag C). Reads recruiter mail +
 * calendar (readonly), classifies, and drafts replies / screening answers
 * grounded in the master profile. EVERY outbound is you-send: RO drafts, the
 * human sends from their own client. No send capability here. RLS-scoped.
 */
async function run(skill: Skill, input: SkillInput, uid: string) {
  const { verdict } = await runSkill(skill, input);
  await logAgentRuns(uid, verdict.runs, { skill: skill.id, judge: verdict });
  return parseModelJson<Record<string, unknown>>(verdict.finalOutput);
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const uid = user.id;
  const body = (await req.json()) as Record<string, unknown>;
  const action = body.action as string;

  const masterRaw = async () => {
    const { data } = await supabase.from("master_profile").select("data").eq("user_id", uid).single();
    return ((data?.data as { raw?: string } | null)?.raw ?? "").slice(0, 6000);
  };

  try {
    switch (action) {
      case "scan": {
        const token = await getGoogleAccessToken(uid);
        if (!token) return NextResponse.json({ connected: false });

        const [emails, availability] = await Promise.all([
          gmailRecent(token, 12),
          calendarUpcoming(token, 10).catch(() => []),
        ]);

        // Classify each in parallel (cheap Haiku). Keep ones that look hiring-related.
        const classified = await Promise.all(
          emails.map(async (e) => {
            const c = await run(
              classifyRecruiter,
              { userId: uid, data: { from: e.from, subject: e.subject, body: e.body } },
              uid,
            );
            return { ...e, classification: c };
          }),
        );
        const relevant = classified.filter(
          (e) => e.classification && (e.classification.category as string) !== "other",
        );
        return NextResponse.json({ connected: true, emails: relevant, availability });
      }

      case "draft_reply": {
        const profile = await masterRaw();
        const draft = await run(
          recruiterReply,
          {
            userId: uid,
            data: {
              message: body.message,
              classification: body.classification,
              constraints: { profile_summary: profile, availability: body.availability ?? [] },
            },
          },
          uid,
        );
        return NextResponse.json({ draft });
      }

      case "draft_screening": {
        const profile = await masterRaw();
        if (!profile) {
          return NextResponse.json(
            { error: "I need your background first — run onboarding so I can answer truthfully." },
            { status: 400 },
          );
        }
        const { verdict } = await runSkill(screeningAnswer, {
          userId: uid,
          data: { question: body.question, profile, groundTruth: profile },
        });
        await logAgentRuns(uid, verdict.runs, { skill: screeningAnswer.id, judge: verdict });
        const draft = parseModelJson<Record<string, unknown>>(verdict.finalOutput);
        return NextResponse.json({ draft, status: verdict.status, truth: verdict.truth });
      }

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "recruiter step failed" },
      { status: 500 },
    );
  }
}

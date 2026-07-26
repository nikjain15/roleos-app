import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { callModel } from "@/agent/registry";
import { logAgentRuns } from "@/lib/agent-runs";
import { mapFlags } from "@/lib/resume/flags";
import { parseResumeDoc, scorerBullets, updateLineAt } from "@/lib/resume/doc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Use RO's grounded version" for ONE flagged bullet (Slice 1, P0-3). Re-grounds
 * that single line strictly to the master profile via the metered registry (never
 * inventing — the truth-gate invariant applies here too: no send tool, ground truth
 * = master_profile). Writes the result back to the artifact, marks the resolved
 * violations, recomputes live status, and logs an append-only `correct` event +
 * the model call to agent_runs. zod-validated (D6); RLS-scoped.
 */
const BodySchema = z.object({
  bulletIndex: z.number().int().min(0).max(59),
  reasons: z.array(z.string()).max(20).default([]),
});

const REGROUND_SYSTEM =
  "You are RO's truth gate, fixing ONE résumé bullet. Rewrite it so every claim traces strictly to the MASTER PROFILE — keep only what's supported, tone down or drop what isn't. Never invent titles, employers, metrics, skills, or scope. Keep it a single crisp résumé bullet in the candidate's voice. Return ONLY the revised bullet text — no quotes, no preamble.";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { bulletIndex, reasons } = parsed.data;

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, status, content, provenance, role_id")
    .eq("id", id)
    .single<{
      id: string;
      status: string;
      content: { bullets?: { text: string; rationale?: string; evidence?: string }[]; resolved_violations?: string[] } & Record<string, unknown>;
      provenance: { truth?: { violations?: string[] } | null } | null;
      role_id: string | null;
    }>();
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });

  const content = artifact.content ?? {};
  // Flatten via the doc model (handles sectioned + legacy flat); bulletIndex is a
  // global line index in document order.
  const doc = parseResumeDoc(content);
  const bullets = scorerBullets(doc);
  if (bulletIndex >= bullets.length) {
    return NextResponse.json({ error: "no such bullet" }, { status: 400 });
  }

  // Ground truth = the user's master profile (the only source of truth).
  const { data: mp } = await supabase
    .from("master_profile")
    .select("data")
    .eq("user_id", user.id)
    .single<{ data: { raw?: string } | null }>();
  const groundTruth = mp?.data?.raw ?? "";
  if (!groundTruth) {
    return NextResponse.json(
      { error: "no master profile to ground against" },
      { status: 409 },
    );
  }

  const original = bullets[bulletIndex].text;
  if (!original) return NextResponse.json({ error: "no such bullet" }, { status: 400 });
  const { text, run } = await callModel(
    "draft",
    {
      system: REGROUND_SYSTEM,
      prompt: `MASTER PROFILE (only source of truth):\n${groundTruth}\n\nFLAGGED BECAUSE:\n${
        reasons.join("\n") || "(overstates the profile)"
      }\n\nBULLET TO FIX:\n${original}`,
    },
    { skill: `reground:resume` },
  );
  const grounded = text.trim().replace(/^["'•\-\s]+|["']+$/g, "");
  await logAgentRuns(user.id, [run], { skill: "reground:resume" });

  if (!grounded) {
    return NextResponse.json({ error: "could not reground" }, { status: 502 });
  }

  // Apply: replace that line (by global index) in the doc structure, mark its
  // violations resolved, recompute status. Persist the sectioned experience.
  const nextExperience = updateLineAt(doc, bulletIndex, (line) => ({ ...line, text: grounded }));
  const resolved = Array.from(new Set([...(content.resolved_violations ?? []), ...reasons]));
  const nextContent = { ...content, experience: nextExperience, resolved_violations: resolved };
  const nextBullets = scorerBullets(parseResumeDoc(nextContent));

  // Derived truth state for the client; status stays the user's to set (see edit route).
  const violations = artifact.provenance?.truth?.violations ?? [];
  const { grounded: allClear } = mapFlags(nextBullets, violations, resolved);

  const { error } = await supabase
    .from("artifacts")
    .update({ content: nextContent })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });

  // Append-only signal: the user took RO's grounded correction.
  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "resume",
    subject_ref: id,
    action: "correct",
    payload: { role_id: artifact.role_id, bulletIndex },
    weight: 2,
  });

  return NextResponse.json({ ok: true, bulletIndex, text: grounded, status: artifact.status, grounded: allClear });
}

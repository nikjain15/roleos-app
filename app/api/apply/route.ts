import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * THE apply gesture (Slice 4 — replaces the /api/dispatch 501). A human clicks
 * "I've applied" in the UI; that gesture POSTs here. Per the human-gated-outward
 * invariant (architecture §6), this route performs **NO external transport** —
 * RoleOS never sends. The actual application goes out when the user opens the
 * pre-filled Gmail/ATS compose (built in `lib/apply.ts`) and submits it there.
 *
 * What this DOES do on the gesture: verify the résumé is APPROVED (truth-gated —
 * nothing unapproved is applied with), record an append-only decision_event
 * (action='send'), and advance the tracker for that role to 'applied' (stamping
 * sent_at → the pace engine sees a real send). zod-validated, RLS-scoped.
 */
const BodySchema = z.object({ artifactId: z.string().uuid() });

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { artifactId } = parsed.data;

  // Truth/approval gate: only an APPROVED artifact can be applied with.
  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, status, role_id")
    .eq("id", artifactId)
    .single<{ id: string; status: string; role_id: string | null }>();
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (artifact.status !== "approved") {
    return NextResponse.json(
      { error: "make it yours first — only an approved résumé can be applied with" },
      { status: 409 },
    );
  }
  if (!artifact.role_id) {
    return NextResponse.json({ error: "no role linked to this résumé" }, { status: 409 });
  }

  const now = new Date().toISOString();

  // Link to the active goal, if any (for funnel attribution).
  const { data: goal } = await supabase
    .from("goals")
    .select("id")
    .eq("status", "active")
    .maybeSingle<{ id: string }>();

  // Advance (or create) the tracker row for this role → 'applied'.
  const { data: existing } = await supabase
    .from("applications")
    .select("id, stage_history, sent_at")
    .eq("role_id", artifact.role_id)
    .maybeSingle<{ id: string; stage_history: Array<{ stage: string; at: string }>; sent_at: string | null }>();

  let applicationId: string;
  if (existing) {
    const history = [...(existing.stage_history ?? []), { stage: "applied", at: now }];
    await supabase
      .from("applications")
      .update({ stage: "applied", stage_history: history, sent_at: existing.sent_at ?? now, updated_at: now })
      .eq("id", existing.id);
    applicationId = existing.id;
  } else {
    const { data: ins, error } = await supabase
      .from("applications")
      .insert({
        user_id: user.id,
        role_id: artifact.role_id,
        goal_id: goal?.id ?? null,
        stage: "applied",
        stage_history: [{ stage: "applied", at: now }],
        artifact_ids: [artifactId],
        sent_at: now,
        updated_at: now,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !ins) return NextResponse.json({ error: "could not record" }, { status: 500 });
    applicationId = ins.id;
  }

  // Append-only send gesture (the human-gated-outward record).
  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "application",
    subject_ref: applicationId,
    action: "send",
    payload: { role_id: artifact.role_id, artifact_id: artifactId },
    weight: 3,
  });

  return NextResponse.json({ ok: true, applicationId, stage: "applied" });
}

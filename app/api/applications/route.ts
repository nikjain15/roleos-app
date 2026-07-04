import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { deriveNextAction } from "@/lib/tracker";

export const dynamic = "force-dynamic";

/**
 * The tracker's write API (buildplan §3). POST creates an application for a role;
 * PATCH advances its stage — appending to the append-only `stage_history` and
 * stamping `sent_at` on first reaching 'applied'. Both zod-validated (D6) and
 * RLS-scoped (owner-only). Advancing writes a decision_event (the funnel signal
 * that recalibrates the pace engine). No outward send happens here — reaching
 * 'applied' records that the user applied; sending stays the separate apply path.
 */
const STAGES = [
  "saved",
  "drafting",
  "ready",
  "applied",
  "screening",
  "interviewing",
  "onsite",
  "offer",
  "rejected",
  "withdrawn",
] as const;
const StageEnum = z.enum(STAGES);

const CreateSchema = z.object({
  role_id: z.string().uuid(),
  goal_id: z.string().uuid().nullable().optional(),
  stage: StageEnum.default("saved"),
  artifact_ids: z.array(z.string().uuid()).max(20).optional(),
});

const AdvanceSchema = z.object({
  id: z.string().uuid(),
  stage: StageEnum,
  next_action: z.object({ label: z.string().max(200), due: z.string().optional() }).nullable().optional(),
});

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, CreateSchema);
  if (!parsed.ok) return parsed.response;
  const { role_id, goal_id, stage, artifact_ids } = parsed.data;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      role_id,
      goal_id: goal_id ?? null,
      stage,
      stage_history: [{ stage, at: now }],
      artifact_ids: artifact_ids ?? null,
      next_action: deriveNextAction(stage, { enteredAt: now }),
      sent_at: stage === "applied" ? now : null,
      updated_at: now,
    })
    .select("id, stage")
    .single<{ id: string; stage: string }>();

  // Unique (user, role) violation → already tracking this role.
  if (error?.code === "23505") {
    return NextResponse.json({ error: "already tracking this role" }, { status: 409 });
  }
  if (error || !data) return NextResponse.json({ error: "create failed" }, { status: 500 });

  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "application",
    subject_ref: data.id,
    action: "edit",
    payload: { role_id, stage },
    weight: 1,
  });

  return NextResponse.json({ ok: true, application: data });
}

export async function PATCH(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, AdvanceSchema);
  if (!parsed.ok) return parsed.response;
  const { id, stage, next_action } = parsed.data;

  const { data: app } = await supabase
    .from("applications")
    .select("id, stage, stage_history, sent_at, role_id")
    .eq("id", id)
    .single<{
      id: string;
      stage: string;
      stage_history: Array<{ stage: string; at: string }>;
      sent_at: string | null;
      role_id: string | null;
    }>();
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date().toISOString();
  const history = [...(app.stage_history ?? []), { stage, at: now }];
  const terminal = stage === "rejected" || stage === "withdrawn";

  const { error } = await supabase
    .from("applications")
    .update({
      stage,
      stage_history: history,
      sent_at: app.sent_at ?? (stage === "applied" ? now : null),
      // W5: an explicit next_action wins; otherwise derive the stage's default
      // (deterministic, no model call) so the card always shows a real next step.
      next_action: next_action !== undefined ? next_action : deriveNextAction(stage, { enteredAt: now }),
      updated_at: now,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "advance failed" }, { status: 500 });

  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "application",
    subject_ref: id,
    action: terminal ? "reject" : "edit",
    payload: { role_id: app.role_id, from: app.stage, to: stage },
    weight: 2,
  });

  return NextResponse.json({ ok: true, id, stage });
}

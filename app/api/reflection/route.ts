import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { REASON_OPTIONS } from "@/lib/rejection-growth";

/**
 * X11 — capture a rejection reflection (docs/specs/x11-rejection-growth.md). The
 * structured reason is the signal the outcome model gains. Written as an
 * append-only `reflection`-kind decision-event with the allowed `correct`
 * action (annotating an outcome — no migration to the check constraint). This
 * route records and NOTHING ELSE: it never changes the application's stage,
 * touches another row, or sends anything. RLS-scoped; owner + rejected only.
 */
export const dynamic = "force-dynamic";

const REASONS = REASON_OPTIONS.map((o) => o.value) as [string, ...string[]];

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(
    req,
    z.object({
      applicationId: z.string().uuid(),
      reason: z.enum(REASONS),
      note: z.string().max(1_000).optional(),
    }),
  );
  if (!parsed.ok) return parsed.response;
  const { applicationId, reason, note } = parsed.data;

  // Ownership + state gate: you can only reflect on your OWN, REJECTED application.
  const { data: app } = await supabase
    .from("applications")
    .select("id, stage, role_id")
    .eq("id", applicationId)
    .single<{ id: string; stage: string; role_id: string | null }>();
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (app.stage !== "rejected") {
    return NextResponse.json({ error: "reflection is only for rejected applications" }, { status: 400 });
  }

  // Idempotency (the log is append-only — corrections are new rows, never edits):
  // if this exact answer is already the latest reflection for this app, no-op.
  const { data: prior } = await supabase
    .from("decision_events")
    .select("payload, created_at")
    .eq("kind", "reflection")
    .eq("subject_ref", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ payload: { reason?: string; note?: string } | null }>();
  if (prior?.payload?.reason === reason && (prior.payload.note ?? "") === (note ?? "")) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { error } = await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "reflection",
    subject_ref: applicationId,
    action: "correct",
    payload: { reason, note: note ?? null, role_id: app.role_id },
    weight: 2,
  });
  if (error) return NextResponse.json({ error: "could not save reflection" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

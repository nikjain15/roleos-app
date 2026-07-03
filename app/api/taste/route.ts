import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { loadDimensions, cacheDimensions } from "@/lib/taste-dimensions";

export const dynamic = "force-dynamic";

/**
 * The 15-dimension self-learning model API (Slice 8). GET derives the dimensions
 * from the user's real signals + overlays their corrections. POST records a
 * correction/confirmation (transparent + correctable, goal-engine §7). RLS-scoped,
 * zod-validated. No send.
 */
export async function GET(): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const dims = await loadDimensions(supabase);
  // Best-effort: cache the derived snapshot (never blocks the response).
  cacheDimensions(supabase, user.id).catch(() => {});
  return NextResponse.json({ dimensions: dims });
}

const BodySchema = z.object({
  dimension: z.number().int().min(1).max(15),
  user_note: z.string().max(400).nullable().optional(),
  confirmed: z.boolean(),
});

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { dimension, user_note, confirmed } = parsed.data;

  const { error } = await supabase.from("taste_dimensions").upsert(
    {
      user_id: user.id,
      dimension,
      user_note: user_note ?? null,
      user_confirmed: confirmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,dimension" },
  );
  if (error) return NextResponse.json({ error: "couldn't save" }, { status: 500 });

  // The user correcting RO is a high-value taste signal — record it (append-only).
  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "taste_dimension",
    subject_ref: String(dimension),
    action: "correct",
    payload: { dimension, confirmed },
    weight: 3,
  });

  return NextResponse.json({ ok: true, dimension });
}

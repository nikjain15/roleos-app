import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { parseCanonicalProfile } from "@/lib/profile-schema";
import { applyProfileEdit, profileEditEvent, type ProfileEdit } from "@/lib/profile-events";

/**
 * P2 — correct what RO knows about you. Updates the stored canonical profile in
 * place (source "user", full confidence) AND appends a high-weight decision_event
 * so the correction feeds the taste model. RLS-scoped: a user edits only their own
 * master_profile. No send capability (human-gated-outward holds).
 */
export const dynamic = "force-dynamic";

const EDITABLE = [
  "name", "headline", "location", "seniority",
  "target.role", "target.level", "target.comp", "target.location",
] as const;

const schema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("correct"), field: z.enum(EDITABLE), to: z.string().trim().min(1).max(300) }),
  z.object({ op: z.literal("reject"), field: z.literal("skill"), value: z.string().trim().min(1).max(120) }),
]);

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const edit = parsed.data as ProfileEdit;

  const { data: mp, error } = await supabase
    .from("master_profile")
    .select("data")
    .eq("user_id", user.id)
    .single();
  if (error || !mp) return NextResponse.json({ error: "no profile yet" }, { status: 404 });

  const data = (mp.data ?? {}) as Record<string, unknown>;
  if (!data.profile) return NextResponse.json({ error: "no structured profile to edit" }, { status: 409 });

  const at = new Date().toISOString();
  const current = parseCanonicalProfile(data.profile, { defaultSource: "user", at });
  const updated = applyProfileEdit(current, edit, at);

  const { error: upErr } = await supabase.from("master_profile").upsert(
    { user_id: user.id, data: { ...data, profile: updated }, updated_at: at },
    { onConflict: "user_id" },
  );
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // High-weight taste signal — an explicit fix (append-only).
  const { error: deErr } = await supabase
    .from("decision_events")
    .insert({ ...profileEditEvent(edit), user_id: user.id });
  if (deErr) return NextResponse.json({ error: deErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, profile: updated });
}

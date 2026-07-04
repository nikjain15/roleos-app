import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * Per-role notes (roles-workspace P1, slice W4). Free text, RLS-scoped, one row
 * per (user, role). An empty note deletes the row (no tombstones). No model
 * call, no transport — this is the user's private working memory.
 */
const BodySchema = z.object({
  roleId: z.string().uuid(),
  note: z.string().max(2000),
});

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { roleId, note } = parsed.data;

  const trimmed = note.trim();
  if (trimmed.length === 0) {
    const { error } = await supabase.from("role_notes").delete().eq("role_id", roleId);
    if (error) return NextResponse.json({ error: "couldn't clear the note" }, { status: 500 });
    return NextResponse.json({ ok: true, note: null });
  }

  const { error } = await supabase.from("role_notes").upsert(
    { user_id: user.id, role_id: roleId, note: trimmed, updated_at: new Date().toISOString() },
    { onConflict: "user_id,role_id" },
  );
  if (error) return NextResponse.json({ error: "couldn't save the note" }, { status: 500 });
  return NextResponse.json({ ok: true, note: trimmed });
}

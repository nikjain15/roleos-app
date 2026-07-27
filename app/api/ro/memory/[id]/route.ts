import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { embeddings } from "@/lib/embeddings";

export const dynamic = "force-dynamic";

/**
 * Edit or forget one note in RO's notebook ("What RO remembers", M1c). The user is
 * authoritative about themselves: they can correct a note's text (re-embedded so
 * recall stays accurate) or delete it outright ("forget this"). RLS-scoped — owner
 * policies on ro_memory mean a user can only touch their own notes. No send here.
 */
const Params = z.object({ id: z.string().uuid() });
const PatchBody = z.object({ text: z.string().trim().min(1).max(300) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const parsed = Params.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const body = await validateBody(req, PatchBody);
  if (!body.ok) return body.response;

  // Re-embed so the corrected note recalls correctly. User edit = full confidence.
  const [embedding] = await embeddings().embed([body.data.text]);
  const { error } = await supabase
    .from("ro_memory")
    .update({ text: body.data.text, embedding, confidence: 1 })
    .eq("id", parsed.data.id); // RLS also scopes to the owner
  if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const parsed = Params.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { error } = await supabase.from("ro_memory").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: "delete failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Lightweight status poll for the async coach phases (prep + debrief). Returns
 * the phase states AND the finished content, so the client renders straight from
 * the poll that observes completion. RLS-scoped read — only the owner sees their
 * pipeline. No model call. Legacy rows (no `status` key) read as ready.
 */
const Params = z.object({ id: z.string().uuid() });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const parsed = Params.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: pipe } = await supabase
    .from("pipeline")
    .select("messages, debriefs")
    .eq("id", parsed.data.id)
    .single<{ messages: { status?: string; prep?: unknown; debrief_status?: string } | null; debriefs: unknown[] | null }>();
  if (!pipe) return NextResponse.json({ error: "not found" }, { status: 404 });

  const msgs = pipe.messages ?? {};
  const debriefs = pipe.debriefs ?? [];
  return NextResponse.json({
    status: msgs.status ?? (msgs.prep ? "ready" : "prepping"),
    prep: msgs.status === "ready" || (!msgs.status && msgs.prep) ? (msgs.prep ?? null) : null,
    debriefStatus: msgs.debrief_status ?? null,
    debrief: msgs.debrief_status === "ready" && debriefs.length > 0 ? debriefs[debriefs.length - 1] : null,
  });
}

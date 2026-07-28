import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { parseResumeDoc } from "@/lib/resume/doc";

export const dynamic = "force-dynamic";

/**
 * Lightweight status poll for async drafting (résumés and cover letters). The
 * studio page polls this while an artifact is `drafting` and reloads once it's
 * ready (or errored). RLS-scoped read — only the owner sees their artifact's
 * status. No model call.
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

  const { data: art } = await supabase
    .from("artifacts")
    .select("status, type, content")
    .eq("id", parsed.data.id)
    .single<{ status: string; type: string; content: unknown }>();
  if (!art) return NextResponse.json({ error: "not found" }, { status: 404 });

  let hasBody: boolean;
  if (art.type === "cover") {
    const body = (art.content as { body?: unknown } | null)?.body;
    hasBody = typeof body === "string" && body.length > 0;
  } else {
    const doc = parseResumeDoc(art.content);
    hasBody = Boolean(doc.summary) || doc.experience.some((e) => e.lines.length > 0);
  }
  return NextResponse.json({ status: art.status, hasBody });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * The user's latest unread pace nudge (Slice 9), for the feed. RLS-scoped. GET
 * returns the most recent unread `pace` notification; POST marks it read (the user
 * acknowledging — no send). zod-validated.
 */
export async function GET(): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, payload, created_at")
    .eq("kind", "pace")
    .eq("status", "unread")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; title: string; body: string; payload: unknown; created_at: string }>();

  return NextResponse.json({ nudge: data ?? null });
}

const BodySchema = z.object({ id: z.string().uuid() });

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;

  const { error } = await supabase
    .from("notifications")
    .update({ status: "read" })
    .eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: "couldn't update" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * "Keep me in the loop" — capture what the user is hunting for into their active
 * intent (journey.html §11: intents are goal moments; they flip RO toward push
 * mode AND become the demand signal that drives ingestion). RLS-scoped to
 * auth.uid(); one active intent per user (upsert). A high-weight decision_event
 * records the moment for the taste model.
 */
interface WatchBody {
  target_role?: string;
  keywords?: string[];
  companies?: string[];
  location?: string;
  target_base_usd?: number | null;
  intensity?: number; // 1 explore · 2 keen · 3 pushing
  notify?: boolean;
}

const clean = (a: unknown): string[] =>
  Array.isArray(a)
    ? [...new Set(a.map((s) => String(s).trim()).filter(Boolean))].slice(0, 40)
    : [];

export async function GET(): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { data } = await supabase
    .from("intents")
    .select("target_role, keywords, companies, location, comp, intensity, notify, mode")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  return NextResponse.json({ intent: data ?? null });
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const b = (await req.json()) as WatchBody;
  const intensity = Math.min(3, Math.max(1, Math.round(b.intensity ?? 1)));
  const row = {
    user_id: user.id,
    target_role: (b.target_role ?? "").trim() || null,
    keywords: clean(b.keywords),
    companies: clean(b.companies),
    location: (b.location ?? "").trim() || null,
    comp: typeof b.target_base_usd === "number" ? { target_base_usd: b.target_base_usd } : null,
    intensity,
    mode: intensity >= 2 ? "push" : "explore",
    notify: b.notify ?? true,
    status: "active",
    updated_at: new Date().toISOString(),
  };

  // One active intent per user — update in place if it exists, else insert.
  const { data: existing } = await supabase
    .from("intents")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const res = existing
    ? await supabase.from("intents").update(row).eq("id", existing.id)
    : await supabase.from("intents").insert(row);
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "intent",
    action: "edit",
    payload: { target_role: row.target_role, companies: row.companies, mode: row.mode },
    weight: 3,
  });

  return NextResponse.json({ ok: true });
}

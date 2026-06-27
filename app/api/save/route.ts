import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Save what RO found during onboarding, once the user has signed up. Writes are
 * RLS-scoped to auth.uid() via the cookie-bound client — a user can only write
 * their own rows. Privacy (architecture.md §3.2): nothing persisted until here.
 *
 * Persists: master_profile (the raw background + the mirror), matches (RO's
 * reasoning per role), and one append-only decision_event marking the moment.
 */
interface SaveBody {
  profile: string;
  mirror?: { statements: string[]; insight: string };
  matches?: Array<{
    id: string;
    fit: number;
    recommendation: string;
    why: string;
    gaps: unknown;
  }>;
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const body = (await req.json()) as SaveBody;
  if (!body.profile) return NextResponse.json({ error: "nothing to save" }, { status: 400 });

  // master_profile (projection) — the living source of truth starts here.
  const { error: mpErr } = await supabase.from("master_profile").upsert(
    { user_id: user.id, data: { raw: body.profile, mirror: body.mirror ?? null }, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (mpErr) return NextResponse.json({ error: mpErr.message }, { status: 500 });

  // matches — RO's reasoning per role (upsert on the user×role unique key).
  if (body.matches?.length) {
    const rows = body.matches.map((m) => ({
      user_id: user.id,
      role_id: m.id,
      fit_score: m.fit,
      reasoning: { why: m.why },
      gaps: m.gaps,
      recommendation: m.recommendation,
      status: "new",
    }));
    const { error: mErr } = await supabase.from("matches").upsert(rows, { onConflict: "user_id,role_id" });
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  // append-only decision_event — the substrate the taste model is built from.
  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "onboarding",
    action: "view",
    payload: { scanned: 557, saved_matches: body.matches?.length ?? 0 },
  });

  return NextResponse.json({ ok: true });
}

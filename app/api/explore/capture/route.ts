import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { exploreEvents } from "@/lib/explore-events";

/**
 * Carry an anon Explore chat thread into the taste model, once the visitor has
 * signed up. RLS-scoped to auth.uid() (cookie-bound client). Idempotent: written
 * only on the FIRST capture (no prior explore events for this user), so a repeat
 * page load never double-counts. Privacy (§3.2): nothing persisted before here.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(
    req,
    z.object({
      turns: z
        .array(
          z.object({
            q: z.string().max(500),
            cited: z.array(z.object({ id: z.string().max(100) })).max(8).optional(),
          }),
        )
        .max(12),
    }),
  );
  if (!parsed.ok) return parsed.response;

  // First-capture only — idempotent on retry / repeat load.
  const { count: prior } = await supabase
    .from("decision_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", "explore");
  if ((prior ?? 0) > 0) return NextResponse.json({ ok: true, already: true });

  const rows = exploreEvents(parsed.data.turns).map((r) => ({ ...r, user_id: user.id }));
  if (rows.length === 0) return NextResponse.json({ ok: true, empty: true });

  const { error } = await supabase.from("decision_events").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, captured: rows.length });
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { summarizeRanges } from "@/lib/comp";

export const dynamic = "force-dynamic";

/**
 * X5 — comp benchmark from STATED ranges in the corpus. Authed (it's a member
 * feature), bounded, zero model calls. Always returns n — an archetype with no
 * stated-comp postings gets an honest n=0, never an error or a made-up number.
 */
export async function GET(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const archetype = (url.searchParams.get("archetype") ?? "").trim().slice(0, 120);

  const db = supabaseService(); // role data is global
  let q = db.from("roles").select("archetype, comp").not("comp", "is", null).limit(2000);
  if (archetype) q = q.eq("archetype", archetype);
  const { data } = await q;

  const ranges = (data ?? []).map((r) => {
    const c = r.comp as { base_range_usd?: [number, number] | null } | null;
    return c?.base_range_usd ?? null;
  });
  const stat = summarizeRanges(ranges);

  return NextResponse.json({
    archetype: archetype || "all",
    ...stat,
    basis: "stated base ranges in postings RO has read — not a market survey",
  });
}

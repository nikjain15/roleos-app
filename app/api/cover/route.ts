import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Slice W2 / J10 — start drafting a REAL cover letter for one role. ASYNC (same
 * shape as /api/tailor): validates + creates a `drafting` placeholder artifact and
 * returns its id INSTANTLY. The studio cover page then kicks off the actual draft
 * (/api/artifact/[id]/draft) and polls until it's ready. RLS-scoped; the user
 * reviews, edits, approves, and sends themselves — no send here.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const rate = await checkRateLimit("cover", user.id);
  if (!rate.allowed) {
    return rateLimitResponse("You've drafted a lot of cover letters this hour — review what you have; it resets soon.");
  }

  const parsed = await validateBody(req, z.object({ roleId: z.string().uuid() }));
  if (!parsed.ok) return parsed.response;
  const { roleId } = parsed.data;

  // Validate the inputs exist BEFORE creating a placeholder (fast reads).
  const { data: mp } = await supabase.from("master_profile").select("data").eq("user_id", user.id).single();
  const profileRaw = (mp?.data as { raw?: string } | null)?.raw;
  if (!profileRaw) {
    return NextResponse.json({ error: "no master profile yet — run onboarding first" }, { status: 400 });
  }
  const { data: role } = await supabase.from("roles").select("id").eq("id", roleId).single();
  if (!role) return NextResponse.json({ error: "role not found" }, { status: 404 });

  const { data: artifact, error: aErr } = await supabase
    .from("artifacts")
    .insert({ user_id: user.id, role_id: roleId, type: "cover", content: {}, provenance: {}, status: "drafting" })
    .select("id")
    .single();
  if (aErr || !artifact) return NextResponse.json({ error: aErr?.message ?? "couldn't start" }, { status: 500 });

  return NextResponse.json({ artifactId: artifact.id, status: "drafting" });
}

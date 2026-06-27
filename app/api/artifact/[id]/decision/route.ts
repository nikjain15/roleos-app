import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { projectTaste } from "@/lib/taste";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A user decision on an artifact (approve / edit / reject). Writes an append-only
 * decision_event (the substrate, architecture.md §3.2) and updates the artifact
 * status, then projects the taste model from the new event. NO send happens here
 * — approving makes it ready; sending is the separate user-clicked dispatch.
 *
 * An edit is a high-weight signal (the user corrected RO) — it teaches taste fast.
 */
type Action = "approve" | "edit" | "reject";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { action, edited } = (await req.json()) as { action: Action; edited?: unknown };
  if (!["approve", "edit", "reject"].includes(action)) {
    return NextResponse.json({ error: "bad action" }, { status: 400 });
  }

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, role_id, type, content")
    .eq("id", id)
    .single();
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });

  // append-only decision event (RLS: insert-only for users)
  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: artifact.type,
    subject_ref: id,
    action,
    payload: { role_id: artifact.role_id },
    weight: action === "edit" ? 3 : 1, // a correction teaches taste fastest
  });

  // update the artifact
  if (action === "approve") {
    await supabase.from("artifacts").update({ status: "approved" }).eq("id", id);
  } else if (action === "edit") {
    await supabase
      .from("artifacts")
      .update({ status: "approved", content: edited ?? artifact.content })
      .eq("id", id);
  }
  // reject: status stays; the event records the signal.

  // project taste from the new event (the moat updating)
  const { updated } = await projectTaste(supabase, user.id);

  return NextResponse.json({ ok: true, action, tasteUpdated: updated });
}

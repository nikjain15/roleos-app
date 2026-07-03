import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * Curate a match (Slice 5): save / dismiss / pursue / restore. Updates the match's
 * status and writes an append-only `decision_event` (the taste signal). RLS-scoped:
 * a user only curates their own matches. zod-validated (D6). No model call — this
 * is local curation, not a re-match (that's the separate /api/rematch refresh).
 */
const ACTION_TO_STATUS = {
  save: "saved",
  dismiss: "dismissed",
  pursue: "pursuing",
  restore: "new",
} as const;

const EVENT_ACTION = {
  save: "approve",
  dismiss: "skip",
  pursue: "approve",
  restore: "view",
} as const;

const BodySchema = z.union([
  z.object({
    role_id: z.string().uuid(),
    action: z.enum(["save", "dismiss", "pursue", "restore"]),
  }),
  // Bulk (slice W4): dismiss/restore a filtered view in one gesture. Deliberately
  // NOT save/pursue — positive signals stay per-role decisions.
  z.object({
    role_ids: z.array(z.string().uuid()).min(1).max(100),
    action: z.enum(["dismiss", "restore"]),
  }),
]);

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { action } = parsed.data;
  const roleIds = "role_ids" in parsed.data ? parsed.data.role_ids : [parsed.data.role_id];

  const { data: updated, error } = await supabase
    .from("matches")
    .update({ status: ACTION_TO_STATUS[action] })
    .in("role_id", roleIds)
    .select("role_id, status")
    .returns<{ role_id: string; status: string }[]>();
  if (error) return NextResponse.json({ error: "update failed" }, { status: 500 });
  if (!updated || updated.length === 0) return NextResponse.json({ error: "no such match" }, { status: 404 });

  // One append-only decision event per touched match — the taste signal keeps
  // its per-role granularity even for a bulk gesture.
  await supabase.from("decision_events").insert(
    updated.map((u) => ({
      user_id: user.id,
      kind: "match",
      subject_ref: u.role_id,
      action: EVENT_ACTION[action],
      payload: { role_id: u.role_id, curate: action, bulk: roleIds.length > 1 },
      weight: action === "dismiss" ? 2 : action === "pursue" ? 3 : 1,
    })),
  );

  return NextResponse.json({
    ok: true,
    role_id: updated[0].role_id,
    status: updated[0].status,
    updated: updated.length,
  });
}

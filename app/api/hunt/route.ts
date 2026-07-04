import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import type { HuntAmbient } from "@/lib/hunt";

export const dynamic = "force-dynamic";

/**
 * Pause/resume the overnight hunt (slice X1). The hunt is RO working while the
 * user sleeps — this is the user's off switch, honored immediately by
 * /api/cron/hunt via `profiles.ambient.hunt_paused`. RLS-scoped (own row only);
 * zod-validated; merges into `ambient` so cron bookkeeping fields survive.
 */
export async function PATCH(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, z.object({ paused: z.boolean() }));
  if (!parsed.ok) return parsed.response;

  const { data: row } = await supabase.from("profiles").select("ambient").eq("id", user.id).single();
  const ambient = ((row?.ambient as HuntAmbient | null) ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("profiles")
    .update({ ambient: { ...ambient, hunt_paused: parsed.data.paused } })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: "couldn't save" }, { status: 500 });

  return NextResponse.json({ ok: true, paused: parsed.data.paused });
}

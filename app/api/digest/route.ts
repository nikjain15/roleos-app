import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildAndStoreDigest, isDigestDue, type DigestContent } from "@/lib/digest";
import { DEFAULT_NOTIF_SETTINGS, type Cadence } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The user-facing digest endpoint. Build-if-due (cheap — only runs RO when the
 * cadence interval has passed), then return the latest stored digest. The cron
 * scheduler calls buildAndStoreDigest directly for the eager/background path;
 * this is the on-demand "catch me up" the feed uses. RLS-scoped; no send.
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("notif_settings, ambient")
    .eq("id", user.id)
    .single();
  const cadence = ((profile?.notif_settings as { cadence?: Cadence } | null)?.cadence ??
    DEFAULT_NOTIF_SETTINGS.cadence) as Cadence;
  const lastDigestAt = (profile?.ambient as { last_digest_at?: string } | null)?.last_digest_at ?? null;

  const { data: lastEvent } = await supabase
    .from("decision_events")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const force = new URL(req.url).searchParams.get("force") === "1";
  const due = force || isDigestDue(cadence, lastDigestAt, lastEvent?.created_at ?? null, Date.now());

  let built: DigestContent | null = null;
  if (due) built = await buildAndStoreDigest(user.id);

  // Return the latest stored digest (freshly built or the last one).
  const { data: latest } = await supabase
    .from("notifications")
    .select("payload, created_at")
    .eq("user_id", user.id)
    .eq("kind", "digest")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    digest: (latest?.payload as DigestContent | null) ?? built ?? null,
    built: due && !!built,
  });
}

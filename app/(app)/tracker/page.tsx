import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import TrackerBoard, { type AppRow, type RoleArtifact, type TrackableRole } from "@/components/TrackerBoard";
import HuntToggle from "@/components/HuntToggle";
import type { HuntAmbient } from "@/lib/hunt";

/**
 * Application Tracker (buildplan §3) — the funnel of record. Every role's real
 * stage + timeline; advancing a stage feeds the pace engine. RLS-scoped reads.
 * Pursued roles not yet tracked are offered as one-tap "track" so the pipeline
 * starts from the shortlist.
 */
export const dynamic = "force-dynamic";

export default async function Tracker() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tracker");

  const { data: apps } = await supabase
    .from("applications")
    .select("id, role_id, stage, stage_history, next_action, sent_at, roles(company, role_title, url)")
    .limit(300)
    .order("updated_at", { ascending: false })
    .returns<AppRow[]>();

  const tracked = new Set((apps ?? []).map((a) => a.role_id).filter(Boolean));
  const { data: matches } = await supabase
    .from("matches")
    .select("role_id, fit_score, roles(company, role_title)")
    .limit(200)
    .eq("recommendation", "pursue")
    .order("fit_score", { ascending: false })
    .returns<TrackableRole[]>();
  const trackable = (matches ?? []).filter((m) => m.role_id && !tracked.has(m.role_id)).slice(0, 12);

  // W5: the user's artifacts by role, so each card links to its résumé/cover
  // (RLS-scoped; bounded). Newest first so the freshest artifact leads.
  const { data: artRows } = await supabase
    .from("artifacts")
    .select("id, role_id, type, status")
    .in("type", ["resume", "cover"])
    .order("created_at", { ascending: false })
    .limit(500);
  const artifactsByRole = new Map<string, RoleArtifact[]>();
  for (const a of artRows ?? []) {
    if (!a.role_id) continue;
    const list = artifactsByRole.get(a.role_id as string) ?? [];
    if (list.length < 4) list.push({ id: a.id as string, type: a.type as string, status: a.status as string });
    artifactsByRole.set(a.role_id as string, list);
  }

  // X1: the overnight hunt's user control (paused state lives in profiles.ambient).
  const { data: prof } = await supabase.from("profiles").select("ambient").eq("id", user.id).single();
  const huntPaused = Boolean((prof?.ambient as HuntAmbient | null)?.hunt_paused);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx2">
          ← back to your feed
        </Link>
        <span className="font-mono text-xs text-tx3">tracker · your funnel of record</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Application tracker</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-tx2">
        Every role you&apos;re pursuing and exactly where it stands. Advancing a stage keeps your
        pace honest — it&apos;s what tells RO if you&apos;re on track.{" "}
        <Link href="/ready-room" className="font-medium text-info hover:underline">
          Review the overnight queue →
        </Link>
      </p>

      <HuntToggle initialPaused={huntPaused} />

      <div className="mt-8">
        <TrackerBoard apps={apps ?? []} trackable={trackable} artifacts={Object.fromEntries(artifactsByRole)} />
      </div>
    </main>
  );
}

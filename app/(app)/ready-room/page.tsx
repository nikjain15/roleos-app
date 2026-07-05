import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import {
  assembleQueue,
  type QueueApp,
  type QueueArtifact,
  type QueueMatch,
  type QueueRole,
} from "@/lib/ready-room";
import ReadyRoomClient from "@/components/ReadyRoomClient";

/**
 * X10 — the ready-room: the morning ritual for the overnight queue. One card
 * at a time, one honest decision each (approve & apply · needs work · skip).
 * Server component: RLS-scoped, bounded reads, zero model calls. Sending stays
 * the user's per-item click on the existing Apply page.
 */
export const dynamic = "force-dynamic";

export default async function ReadyRoom() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/ready-room");

  const { data: apps } = await supabase
    .from("applications")
    .select("id, role_id, stage, artifact_ids, created_at")
    .in("stage", ["ready", "drafting"])
    .order("created_at", { ascending: true })
    .limit(100)
    .returns<QueueApp[]>();

  const artifactIds = [...new Set((apps ?? []).flatMap((a) => a.artifact_ids ?? []))];
  const roleIds = [...new Set((apps ?? []).map((a) => a.role_id).filter((r): r is string => Boolean(r)))];

  const [{ data: arts }, { data: roles }, { data: matches }] = await Promise.all([
    artifactIds.length
      ? supabase
          .from("artifacts")
          .select("id, role_id, type, status, content, provenance")
          .in("id", artifactIds)
          .limit(200)
          .returns<QueueArtifact[]>()
      : Promise.resolve({ data: [] as QueueArtifact[] }),
    roleIds.length
      ? supabase.from("roles").select("id, company, role_title").in("id", roleIds).limit(100).returns<QueueRole[]>()
      : Promise.resolve({ data: [] as QueueRole[] }),
    roleIds.length
      ? supabase
          .from("matches")
          .select("role_id, fit_score, reasoning")
          .in("role_id", roleIds)
          .limit(100)
          .returns<QueueMatch[]>()
      : Promise.resolve({ data: [] as QueueMatch[] }),
  ]);

  const cards = assembleQueue(
    apps ?? [],
    new Map((arts ?? []).map((a) => [a.id, a])),
    new Map((roles ?? []).map((r) => [r.id, r])),
    new Map((matches ?? []).map((m) => [m.role_id, m])),
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx2">
          ← back to your feed
        </Link>
        <span className="font-mono text-xs text-tx3">ready-room · you decide</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Your overnight queue</h1>
      <p className="mt-2 max-w-xl text-[15px] text-tx2">
        Everything I lined up while you were away — one at a time, your call each time. Approving
        opens the send page; nothing goes out until you click send there.
      </p>

      <div className="mt-6">
        <ReadyRoomClient initialCards={cards} />
      </div>
    </main>
  );
}

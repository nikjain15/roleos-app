import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { buildApplyBundle, type ApplyCover } from "@/lib/apply";
import ApplyPanel from "@/components/ApplyPanel";
import CoverLetterCard, { type CoverArtifact } from "@/components/CoverLetterCard";

/**
 * Apply / Send (Slice 4) — the human-gated outward step. RO composes the bundle
 * (approved résumé → subject + note + pre-filled compose/ATS links); the USER opens
 * it and submits. Only an APPROVED résumé can be applied with (truth gate). RLS-scoped.
 */
export const dynamic = "force-dynamic";

type Content = { summary?: string; bullets?: { text: string }[] };

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/apply/${id}`);

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, status, content, role_id, roles(company, role_title, url)")
    .eq("id", id)
    .single<{
      id: string;
      status: string;
      content: Content;
      role_id: string | null;
      roles: { company: string; role_title: string; url: string | null } | null;
    }>();
  if (!artifact) notFound();

  const roleLabel = artifact.roles
    ? `${artifact.roles.role_title} — ${artifact.roles.company}`
    : "this role";
  const name =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    undefined;

  // Latest drafted cover letter for this role (W2). An APPROVED one replaces
  // the template in the bundle; anything else renders for review/edit/approve.
  let coverArt: CoverArtifact | null = null;
  if (artifact.role_id) {
    const { data: c } = await supabase
      .from("artifacts")
      .select("id, status, content, provenance")
      .eq("role_id", artifact.role_id)
      .eq("type", "cover")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        status: string;
        content: Record<string, unknown>;
        provenance: Record<string, unknown> | null;
      }>();
    if (c) {
      const truth = (c.provenance?.truth ?? null) as { ok?: boolean; violations?: unknown[] } | null;
      coverArt = {
        id: c.id,
        status: c.status,
        subject: typeof c.content?.subject === "string" ? c.content.subject : "",
        body: typeof c.content?.body === "string" ? c.content.body : "",
        angle: typeof c.content?.angle === "string" ? c.content.angle : null,
        truthFlags:
          c.status !== "approved" && truth && truth.ok === false && Array.isArray(truth.violations)
            ? truth.violations.map((v) => String(v))
            : [],
      };
    }
  }
  const approvedCover: ApplyCover | null =
    coverArt && coverArt.status === "approved" && coverArt.body
      ? { subject: coverArt.subject, body: coverArt.body }
      : null;

  const approved = artifact.status === "approved";
  const bundle = approved
    ? buildApplyBundle(artifact.content ?? {}, artifact.roles ?? {}, name, approvedCover)
    : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href={`/studio/resume/${id}`} className="text-sm text-tx2">
          ← back to the résumé
        </Link>
        <span className="font-mono text-xs text-tx3">apply · you send</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Apply — {roleLabel}</h1>

      {!approved || !bundle ? (
        <div className="mt-6 rounded-xl border-l-[3px] border-warn bg-warn-bg p-4 text-[14px] text-warn">
          <p className="font-semibold">Make it yours first.</p>
          <p className="mt-1">
            Only an approved résumé goes out — resolve any flags and approve it, then come back to
            apply.
          </p>
          <Link
            href={`/studio/resume/${id}`}
            className="mt-3 inline-flex min-h-10 items-center rounded-md bg-info px-4 text-sm font-medium text-white"
          >
            Open the résumé editor →
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {artifact.role_id && <CoverLetterCard roleId={artifact.role_id} cover={coverArt} />}
          <ApplyPanel artifactId={artifact.id} bundle={bundle} roleLabel={roleLabel} />
        </div>
      )}
    </main>
  );
}

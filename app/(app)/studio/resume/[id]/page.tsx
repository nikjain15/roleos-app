import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ArtifactActions from "@/components/ArtifactActions";
import RegenerateResume from "@/components/RegenerateResume";
import ResumeEditor, { type EditorContent } from "@/components/ResumeEditor";
import ResumeReadiness from "@/components/resume/ResumeReadiness";
import type { ResumeScore } from "@/lib/resume/score";

/**
 * Gate 1 — résumé studio (Slice 1: now an editable two-pane canvas, not review-only).
 * Left = the user's real CV (source of truth); right = the editable tailored draft
 * with in-place flag resolution + autosave + PDF/DOCX export. RLS-scoped read.
 * Sending stays separate + human-gated.
 */
export const dynamic = "force-dynamic";

type Provenance = {
  gate_status?: string;
  truth?: { ok: boolean; violations: string[] } | null;
  score?: (ResumeScore & { scoredAt?: string }) | null;
};

export default async function ResumeStudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/studio/resume/${id}`);

  const [{ data: artifact }, { data: mp }] = await Promise.all([
    supabase
      .from("artifacts")
      .select("id, status, content, provenance, role_id, roles(company, role_title)")
      .eq("id", id)
      .single<{
        id: string;
        status: string;
        content: EditorContent;
        provenance: Provenance;
        role_id: string | null;
        roles: { company: string; role_title: string } | null;
      }>(),
    supabase.from("master_profile").select("data").eq("user_id", user.id).single<{ data: { raw?: string } | null }>(),
  ]);
  if (!artifact) notFound();

  const c = artifact.content ?? {};
  const hasBody = Boolean(c.summary) || Boolean(c.bullets && c.bullets.length > 0);
  const violations = artifact.provenance?.truth?.violations ?? [];
  const roleLabel = artifact.roles
    ? `${artifact.roles.company} — ${artifact.roles.role_title}`
    : "this role";

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx2">
          ← back to your feed
        </Link>
        <span className="font-mono text-xs text-tx3">gate 1 · résumé · you send</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Tailored for {roleLabel}</h1>

      {!hasBody ? (
        <RegenerateResume roleId={artifact.role_id} />
      ) : (
        <>
          <div className="mt-6">
            <ResumeReadiness id={artifact.id} initialScore={artifact.provenance?.score ?? null} />
          </div>
          <ResumeEditor
            id={artifact.id}
            roleLabel={roleLabel}
            sourceText={mp?.data?.raw ?? ""}
            violations={violations}
            initialContent={c}
          />
          <ArtifactActions id={artifact.id} status={artifact.status} />
        </>
      )}
    </main>
  );
}

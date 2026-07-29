import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import DraftingPoller from "@/components/resume/DraftingPoller";
import CoverEditor from "@/components/cover/CoverEditor";
import RetryCover from "@/components/cover/RetryCover";

/**
 * Studio › Cover letter (J10) — RO's truth-gated letter for one role, on the
 * design system. Async drafting (poller) → review truth flags → edit → approve.
 * RLS-scoped read; sending stays separate + human-gated.
 */
export const dynamic = "force-dynamic";

const COVER_STAGES = [
  "Reading the role…",
  "Finding your strongest angle…",
  "Writing the letter in your voice…",
  "Truth-checking every claim…",
  "Almost there…",
];

type Content = { subject?: string; body?: string; angle?: string; truth_note?: string };

export default async function CoverStudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/studio/cover/${id}`);

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, status, content, provenance, role_id, roles(company, role_title)")
    .eq("id", id)
    .eq("type", "cover")
    .single<{
      id: string;
      status: string;
      content: Content;
      provenance: { truth?: { ok?: boolean; violations?: unknown[] } | null } | null;
      role_id: string | null;
      roles: { company: string; role_title: string } | null;
    }>();
  if (!artifact) notFound();

  const c = artifact.content ?? {};
  const hasBody = typeof c.body === "string" && c.body.length > 0;
  const truth = artifact.provenance?.truth ?? null;
  const truthFlags =
    artifact.status !== "approved" && truth && truth.ok === false && Array.isArray(truth.violations)
      ? truth.violations.map((v) => String(v))
      : [];
  const roleLabel = artifact.roles ? `${artifact.roles.company} — ${artifact.roles.role_title}` : "this role";

  // The apply page is keyed by the role's approved résumé artifact, if one exists.
  let applyHref: string | null = null;
  if (artifact.role_id) {
    const { data: resumeArt } = await supabase
      .from("artifacts")
      .select("id")
      .eq("role_id", artifact.role_id)
      .eq("type", "resume")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (resumeArt) applyHref = `/apply/${resumeArt.id}`;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href={applyHref ?? "/studio"} className="text-small text-tx2">
          ← back to {applyHref ? "apply" : "studio"}
        </Link>
        <span className="font-mono text-small text-tx3">cover letter · you send</span>
      </div>

      <p className="mt-6 text-small font-medium text-tx3">Cover letter</p>
      <h1 className="mt-1 font-display text-h1 font-bold tracking-tight text-tx">{roleLabel}</h1>

      {artifact.status === "drafting" ? (
        <DraftingPoller id={artifact.id} title="RO is writing your cover letter…" stages={COVER_STAGES} />
      ) : artifact.status === "error" || !hasBody ? (
        <RetryCover roleId={artifact.role_id} />
      ) : (
        <CoverEditor
          id={artifact.id}
          applyHref={applyHref}
          status={artifact.status}
          content={c}
          truthFlags={truthFlags}
        />
      )}
    </main>
  );
}

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ArtifactActions from "@/components/ArtifactActions";

/**
 * Gate 1 — résumé studio. Renders the tailored variant + RO's rationale per
 * change + the truth-gate result + fit lift. The user reviews, makes it theirs,
 * and (separately, human-gated) sends. RLS-scoped read.
 */
export const dynamic = "force-dynamic";

type Content = {
  summary?: string;
  bullets?: { text: string; rationale: string; evidence: string }[];
  keywords_injected?: string[];
  fit_lift?: string;
  truth_note?: string;
};
type Provenance = {
  gate_status?: string;
  truth?: { ok: boolean; violations: string[] } | null;
};

export default async function ResumeStudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/studio/resume/${id}`);

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, status, content, provenance, roles(company, role_title)")
    .eq("id", id)
    .single<{
      id: string;
      status: string;
      content: Content;
      provenance: Provenance;
      roles: { company: string; role_title: string } | null;
    }>();
  if (!artifact) notFound();

  const c = artifact.content ?? {};
  const truth = artifact.provenance?.truth ?? null;
  const truthOk = truth ? truth.ok : artifact.provenance?.gate_status === "passed";

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx3">
          ← back to your feed
        </Link>
        <span className="font-mono text-xs text-tx3">gate 1 · résumé · you send</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">
        Tailored for {artifact.roles?.company} — {artifact.roles?.role_title}
      </h1>

      {/* Truth gate */}
      {truthOk ? (
        <div className="mt-4 rounded-lg border-l-[3px] border-suc bg-suc-bg p-3 text-[13px] text-suc">
          <b>Truth gate passed.</b> Every line traces to your real experience — I reworded, I didn&apos;t invent.
        </div>
      ) : (
        <div className="mt-4 rounded-lg border-l-[3px] border-warn bg-warn-bg p-3 text-[13px] text-warn">
          <b>Needs your eyes.</b> A few lines lean past what I can ground in your profile — I&apos;d rather flag
          them than let a résumé overstate:
          <ul className="mt-1 list-disc pl-5">
            {(truth?.violations ?? []).map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}

      {c.summary && (
        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Summary</p>
          <p className="mt-1 text-[15px] leading-relaxed text-tx">{c.summary}</p>
        </section>
      )}

      {c.bullets && c.bullets.length > 0 && (
        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
            Experience — reworded to their must-haves
          </p>
          <div className="mt-2 space-y-3">
            {c.bullets.map((b, i) => (
              <div key={i} className="rounded-lg border border-bd bg-surf p-3">
                <p className="text-[15px] text-tx">• {b.text}</p>
                <p className="mt-1.5 text-xs text-info-tx">
                  <span className="font-semibold">why:</span> {b.rationale}
                </p>
                {b.evidence && (
                  <p className="mt-0.5 text-xs text-tx3">
                    <span className="font-semibold">grounded in:</span> {b.evidence}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {c.keywords_injected && c.keywords_injected.length > 0 && (
        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">ATS keywords woven in</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {c.keywords_injected.map((k, i) => (
              <span key={i} className="rounded-md bg-surf2 px-2 py-1 text-xs text-tx2">
                {k}
              </span>
            ))}
          </div>
        </section>
      )}

      {c.fit_lift && (
        <div className="mt-6 rounded-lg border-l-[3px] border-info bg-info-bg p-3 text-[13px] text-info-tx">
          {c.fit_lift}
        </div>
      )}

      {c.truth_note && (
        <p className="mt-3 text-xs text-warn">RO flagged: {c.truth_note}</p>
      )}

      <ArtifactActions id={artifact.id} status={artifact.status} />
    </main>
  );
}

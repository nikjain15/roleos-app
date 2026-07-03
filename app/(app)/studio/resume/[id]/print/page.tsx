import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import AutoPrint from "@/components/AutoPrint";

/**
 * Print-optimized résumé view → the client "Save as PDF" path (Slice 1, P0-7).
 * Clean single-column, black-on-white, selectable text (not an image), ATS-safe.
 * RLS-scoped read. Print CSS strips everything but the résumé.
 */
export const dynamic = "force-dynamic";

type Content = { summary?: string; bullets?: { text: string }[]; keywords_injected?: string[] };

export default async function ResumePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/studio/resume/${id}/print`);

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, content, roles(company, role_title)")
    .eq("id", id)
    .single<{ id: string; content: Content; roles: { company: string; role_title: string } | null }>();
  if (!artifact) notFound();

  const c = artifact.content ?? {};
  const bullets = (c.bullets ?? []).filter((b) => b.text?.trim());

  return (
    <div className="mx-auto max-w-[8.5in] bg-white p-8 text-black print:p-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } } @page { margin: 0.6in; }`}</style>
      <AutoPrint />

      {artifact.roles && (
        <p className="text-center text-sm text-neutral-600">
          {artifact.roles.role_title} — {artifact.roles.company}
        </p>
      )}

      {c.summary && (
        <section className="mt-4">
          <h2 className="border-b border-neutral-300 pb-0.5 text-[13px] font-bold uppercase tracking-wide">
            Summary
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed">{c.summary}</p>
        </section>
      )}

      {bullets.length > 0 && (
        <section className="mt-4">
          <h2 className="border-b border-neutral-300 pb-0.5 text-[13px] font-bold uppercase tracking-wide">
            Experience
          </h2>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
            {bullets.map((b, i) => (
              <li key={i}>{b.text}</li>
            ))}
          </ul>
        </section>
      )}

      {c.keywords_injected && c.keywords_injected.length > 0 && (
        <section className="mt-4">
          <h2 className="border-b border-neutral-300 pb-0.5 text-[13px] font-bold uppercase tracking-wide">
            Skills &amp; Keywords
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed">{c.keywords_injected.join(" · ")}</p>
        </section>
      )}
    </div>
  );
}

import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import AutoPrint from "@/components/AutoPrint";
import { parseResumeDoc } from "@/lib/resume/doc";

/**
 * Print-optimized résumé view → the client "Save as PDF" path (résumé-editor v2).
 * Clean single-column, black-on-white, selectable text (not an image), ATS-safe,
 * grouped into experience sections (Company · Title · Dates → bullets) so it
 * matches the DOCX export exactly (one layout). RLS-scoped read; print CSS strips
 * everything but the résumé. Backward-compatible via parseResumeDoc.
 */
export const dynamic = "force-dynamic";

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
    .single<{ id: string; content: unknown; roles: { company: string; role_title: string } | null }>();
  if (!artifact) notFound();

  const doc = parseResumeDoc(artifact.content);
  const experience = doc.experience.filter((e) => e.lines.some((l) => l.text.trim()));

  return (
    <div className="mx-auto max-w-[8.5in] bg-white p-8 text-black print:p-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } } @page { margin: 0.6in; }`}</style>
      <AutoPrint />

      {artifact.roles && (
        <p className="text-center text-sm text-neutral-600">
          {artifact.roles.role_title} — {artifact.roles.company}
        </p>
      )}

      {doc.summary && (
        <section className="mt-4">
          <h2 className="border-b border-neutral-300 pb-0.5 text-[13px] font-bold uppercase tracking-wide">
            Summary
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed">{doc.summary}</p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mt-4">
          <h2 className="border-b border-neutral-300 pb-0.5 text-[13px] font-bold uppercase tracking-wide">
            Experience
          </h2>
          {experience.map((exp) => (
            <div key={exp.id} className="mt-2.5">
              <p className="text-[13px] font-bold">
                {[exp.company, exp.title].filter(Boolean).join(" — ")}
                {exp.dates && <span className="font-normal italic text-neutral-600">  ·  {exp.dates}</span>}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
                {exp.lines
                  .filter((l) => l.text.trim())
                  .map((l) => (
                    <li key={l.id}>{l.text}</li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {doc.keywords_injected.length > 0 && (
        <section className="mt-4">
          <h2 className="border-b border-neutral-300 pb-0.5 text-[13px] font-bold uppercase tracking-wide">
            Skills &amp; Keywords
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed">{doc.keywords_injected.join(" · ")}</p>
        </section>
      )}
    </div>
  );
}

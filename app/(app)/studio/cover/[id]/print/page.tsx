import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import AutoPrint from "@/components/AutoPrint";
import { parseCoverDoc } from "@/lib/cover/doc";

/**
 * Print-optimized cover-letter view → the client "Save as PDF" path (J10.2).
 * Standard business-letter layout, single column, black-on-white, selectable
 * text — ATS-safe, and matches the DOCX export exactly (one layout). RLS-scoped
 * read; print CSS strips everything but the letter.
 */
export const dynamic = "force-dynamic";

export default async function CoverPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/studio/cover/${id}/print`);

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, type, content, roles(company, role_title)")
    .eq("id", id)
    .single<{ id: string; type: string; content: unknown; roles: { company: string; role_title: string } | null }>();
  if (!artifact || artifact.type !== "cover") notFound();

  const doc = parseCoverDoc(artifact.content);
  const name =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined);
  const dateLine = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-[8.5in] bg-white p-8 text-black print:p-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } } @page { margin: 1in; }`}</style>
      <AutoPrint />

      {name && <p className="text-[15px] font-bold">{name}</p>}
      {artifact.roles && (
        <p className="text-sm text-neutral-600">
          {artifact.roles.role_title} — {artifact.roles.company}
        </p>
      )}
      <p className="mt-4 text-sm">{dateLine}</p>

      {doc.greeting && <p className="mt-4 text-sm leading-relaxed">{doc.greeting}</p>}
      {doc.sections.map((s) => (
        <p key={s.id} className="mt-4 text-sm leading-relaxed">
          {s.text}
        </p>
      ))}
      {doc.signoff && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{doc.signoff}</p>}
    </div>
  );
}

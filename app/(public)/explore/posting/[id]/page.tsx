import Link from "next/link";
import { notFound } from "next/navigation";
import ExploreHeader from "@/components/explore/ExploreHeader";
import AskRo from "@/components/explore/AskRo";
import { posting } from "@/lib/explore";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await posting(id);
  return p
    ? { title: `${p.role_title} at ${p.company} | RoleOS Index`, description: `${p.role_title} at ${p.company}. See requirements and ask RO about your fit.` }
    : { title: "Role not in the Index | RoleOS" };
}

export default async function PostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await posting(id);
  if (!p) notFound();

  return (
    <>
      <ExploreHeader
        crumbs={[
          { label: "Index", href: "/explore" },
          { label: p.company, href: `/explore/company/${p.companySlug}` },
          { label: p.role_title },
        ]}
      />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight">{p.role_title}</h1>
        <p className="mt-1 text-sm text-tx2">
          {p.company}
          {p.location?.name ? ` · ${p.location.name}` : ""}
          {p.seniority?.level ? ` · ${p.seniority.level}` : ""}
          {p.archetype ? ` · ${p.archetype}` : ""}
        </p>
        {p.url && (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-info hover:underline">
            View original posting ↗
          </a>
        )}

        {p.source === "ats" && (
          <p className="mt-4 rounded-lg border border-bd bg-surf2 px-3 py-2 text-xs text-tx3">
            Freshly hunted from the company board — RO hasn&apos;t fully read this one yet, so detail is lighter.
          </p>
        )}

        {p.mustHaves.length > 0 && (
          <section className="mt-8">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tx3">Must-haves</p>
            <ul className="space-y-1.5">
              {p.mustHaves.map((m, i) => (
                <li key={i} className="flex gap-2 text-sm text-tx2">
                  <span className="text-tx3">•</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {p.niceToHaves.length > 0 && (
          <section className="mt-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tx3">Nice-to-haves</p>
            <ul className="space-y-1.5">
              {p.niceToHaves.map((m, i) => (
                <li key={i} className="flex gap-2 text-sm text-tx2">
                  <span className="text-tx3">•</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {p.mustHaves.length === 0 && p.description && (
          <section className="mt-8">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tx3">Description</p>
            <p className="whitespace-pre-wrap text-sm text-tx2">{p.description.slice(0, 2000)}</p>
          </section>
        )}

        <AskRo
          scope={{ company: p.company }}
          label={`the ${p.role_title} role at ${p.company}`}
          suggestions={["Am I a fit for this?", `What else is open at ${p.company}?`]}
        />
        <p className="mt-6 text-xs text-tx3">
          <Link href="/explore/companies" className="hover:text-info">← Back to all companies</Link>
        </p>
      </main>
    </>
  );
}

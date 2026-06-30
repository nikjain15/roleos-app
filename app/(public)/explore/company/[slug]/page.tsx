import { notFound } from "next/navigation";
import ExploreHeader from "@/components/explore/ExploreHeader";
import AskRo from "@/components/explore/AskRo";
import RoleList from "@/components/explore/RoleList";
import { companyBySlug, companyRoles } from "@/lib/explore";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await companyBySlug(slug);
  return company
    ? { title: `${company} — open senior roles in the Index | RoleOS`, description: `Every senior role RoleOS is tracking at ${company}. Ask RO about them.` }
    : { title: "Company not in the Index | RoleOS" };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await companyBySlug(slug);
  if (!company) notFound();
  const roles = await companyRoles(company);
  const curated = roles.filter((r) => r.source !== "ats").length;

  return (
    <>
      <ExploreHeader crumbs={[{ label: "Index", href: "/explore" }, { label: "Companies", href: "/explore/companies" }, { label: company }]} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight">{company}</h1>
        <p className="mt-1 text-sm text-tx2">
          {roles.length} open {roles.length === 1 ? "role" : "roles"} in the Index
          {curated > 0 ? ` · ${curated} fully read` : ""}.
        </p>
        <div className="mt-8">
          <RoleList roles={roles} />
        </div>
        <AskRo
          scope={{ company }}
          label={company}
          suggestions={[`What do ${company}'s roles require?`, `Does ${company} sponsor visas?`]}
        />
      </main>
    </>
  );
}

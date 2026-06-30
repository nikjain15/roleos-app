import ExploreHeader from "@/components/explore/ExploreHeader";
import AskRo from "@/components/explore/AskRo";
import CompanyGrid from "@/components/explore/CompanyGrid";
import { listCompanies } from "@/lib/explore";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "All companies in the Index | RoleOS",
  description: "Every company RoleOS is tracking senior roles at.",
};

export default async function CompaniesPage() {
  const companies = await listCompanies();
  return (
    <>
      <ExploreHeader crumbs={[{ label: "Index", href: "/explore" }, { label: "Companies" }]} />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight">Companies we&apos;re tracking</h1>
        <p className="mt-1 text-sm text-tx2">{companies.length} companies with open senior roles in the Index.</p>
        <div className="mt-8">
          <CompanyGrid companies={companies} />
        </div>
        <AskRo suggestions={["Which companies have the most senior roles?", "Who sponsors visas?"]} />
      </main>
    </>
  );
}

import Link from "next/link";
import ExploreHeader from "@/components/explore/ExploreHeader";
import AskRo from "@/components/explore/AskRo";
import { indexStats } from "@/lib/explore";

/**
 * /index — the public Explore overview (docs/explore-index.md). Where the
 * marketing "See all" buttons land. Live (service-role SSR), public, SEO-able.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "The Index — every senior AI-native role RO is tracking | RoleOS",
  description:
    "Browse the live index of senior product, program, ops and strategy roles across AI-native companies. Ask RO about any of them.",
};

export default async function IndexHome() {
  const { totalRoles, companies, archetypes } = await indexStats();

  return (
    <>
      <ExploreHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">The Index</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Every role RO is tracking, in the open.</h1>
        <p className="mt-2 text-[15px] text-tx2">
          <span className="font-semibold text-tx">{totalRoles.toLocaleString()}</span> roles across{" "}
          <span className="font-semibold text-tx">{companies.length.toLocaleString()}</span> companies — updated as RO hunts.
        </p>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Top companies</p>
              <Link href="/explore/companies" className="text-xs text-info">See all {companies.length} →</Link>
            </div>
            <ul className="divide-y divide-bd overflow-hidden rounded-xl border border-bd">
              {companies.slice(0, 12).map((c) => (
                <li key={c.slug}>
                  <Link href={`/explore/company/${c.slug}`} className="flex items-center justify-between bg-surf px-4 py-2.5 text-sm hover:bg-surf2">
                    <span className="truncate text-tx">{c.company}</span>
                    <span className="shrink-0 text-tx3">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Role types</p>
              <Link href="/explore/roles" className="text-xs text-info">See all {archetypes.length} →</Link>
            </div>
            <ul className="divide-y divide-bd overflow-hidden rounded-xl border border-bd">
              {archetypes.slice(0, 12).map((a) => (
                <li key={a.slug}>
                  <Link href={`/explore/role/${a.slug}`} className="flex items-center justify-between bg-surf px-4 py-2.5 text-sm hover:bg-surf2">
                    <span className="truncate text-tx">{a.name}</span>
                    <span className="shrink-0 text-tx3">{a.count} · {a.pct}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <AskRo
          suggestions={[
            "Which companies sponsor visas?",
            "Who lists salary upfront?",
            "What do AI Product Manager roles require?",
          ]}
        />
      </main>
    </>
  );
}

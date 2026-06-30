import Link from "next/link";
import ExploreHeader from "@/components/explore/ExploreHeader";
import AskRo from "@/components/explore/AskRo";
import { listArchetypes } from "@/lib/explore";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "All role types in the Index | RoleOS",
  description: "Senior product, program, ops, strategy and growth role types RoleOS tracks.",
};

export default async function RolesPage() {
  const archetypes = await listArchetypes();
  const max = Math.max(...archetypes.map((a) => a.count), 1);
  return (
    <>
      <ExploreHeader crumbs={[{ label: "Index", href: "/explore" }, { label: "Role types" }]} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight">Role types in the Index</h1>
        <p className="mt-1 text-sm text-tx2">{archetypes.length} types across every tracked posting.</p>
        <ul className="mt-8 space-y-1.5">
          {archetypes.map((a) => (
            <li key={a.slug}>
              <Link href={`/explore/role/${a.slug}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surf2">
                <span className="w-56 shrink-0 truncate text-sm text-tx">{a.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surf2">
                  <span className="block h-full rounded-full bg-info" style={{ width: `${(a.count / max) * 100}%` }} />
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-tx3">{a.count} · {a.pct}%</span>
              </Link>
            </li>
          ))}
        </ul>
        <AskRo suggestions={["Which role type is most common?", "What do AI PM roles require?"]} />
      </main>
    </>
  );
}

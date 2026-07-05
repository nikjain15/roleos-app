import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ConnectionsManager from "@/components/ConnectionsManager";

/**
 * X6 — the user's people (sources A+D: their own LinkedIn export + hand-typed).
 * Owner-RLS rows, shown in the open, deletable in one click. Warm paths built
 * from this list surface on each role's Apply page; RO never contacts anyone.
 */
export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/connections");

  const { count } = await supabase.from("connections").select("id", { count: "exact", head: true });
  const { data: recent } = await supabase
    .from("connections")
    .select("id, name, company, title, source")
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx2">
          ← back to your feed
        </Link>
        <span className="font-mono text-xs text-tx3">connections · warm paths in</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Your people</h1>
      <p className="mt-2 max-w-xl text-[15px] text-tx2">
        A referral multiplies your odds. Give me your network — your own LinkedIn export, or just the
        people you&apos;d actually ask — and I&apos;ll spot the warm path into each role you pursue. I only
        ever show them to you; any ask goes out from your hands, not mine.
      </p>

      <div className="mt-6">
        <ConnectionsManager total={count ?? 0} />
      </div>

      {(recent ?? []).length > 0 && (
        <section aria-label="Recently added" className="mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
            Recently added · {count} total
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-tx2">
            {recent!.map((c) => (
              <li key={c.id as string} className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-medium text-tx">{c.name as string}</span>
                {c.title ? <span>· {c.title as string}</span> : null}
                {c.company ? <span className="text-tx3">@ {c.company as string}</span> : null}
                <span className="rounded bg-surf2 px-1 text-[10px] text-tx3">{c.source as string}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

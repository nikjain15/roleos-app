import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { summarizeRanges, type RangeStat } from "@/lib/comp";
import OfferCompare from "@/components/OfferCompare";

/**
 * X5 — the offer decision co-pilot. Benchmark strip (stated ranges in RO's
 * corpus for the user's goal archetype, honest n) + a fully client-side offer
 * comparison (offers never leave the browser). Zero model calls.
 */
export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/offers");

  // Benchmark for the user's goal archetype (falls back to all stated ranges).
  const { data: goal } = await supabase
    .from("goals")
    .select("target")
    .eq("status", "active")
    .maybeSingle<{ target: { archetype?: string } | null }>();
  const archetype = goal?.target?.archetype ?? null;

  const db = supabaseService();
  let q = db.from("roles").select("comp").not("comp", "is", null).limit(2000);
  if (archetype) q = q.eq("archetype", archetype);
  const { data: rows } = await q;
  const stat: RangeStat = summarizeRanges(
    (rows ?? []).map((r) => (r.comp as { base_range_usd?: [number, number] | null } | null)?.base_range_usd ?? null),
  );

  const usd = (n: number | null) => (n === null ? "—" : `$${Math.round(n / 1000)}k`);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx2">
          ← back to your feed
        </Link>
        <span className="font-mono text-xs text-tx3">offers · your call, with the math shown</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Offer decision co-pilot</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-tx2">
        Put your offers side by side, weight what actually matters to you, and see the arithmetic —
        not a verdict. Your offers stay in this browser; nothing is uploaded.
      </p>

      <section className="mt-6 rounded-xl border border-bd bg-surf p-4" aria-label="Market context">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
          Stated pay in postings RO has read{archetype ? ` · ${archetype}` : ""}
        </h2>
        {stat.n === 0 ? (
          <p className="mt-2 text-[13px] text-tx2">
            None of the stored {archetype ?? ""} postings state a base range — so no benchmark,
            rather than a made-up one. Postings that state pay show it on their cards.
          </p>
        ) : (
          <p className="mt-2 text-[14px] text-tx2">
            Across <span className="font-semibold text-tx">{stat.n}</span> postings that state base pay:
            p25 <span className="font-mono text-tx">{usd(stat.p25)}</span> · median{" "}
            <span className="font-mono text-tx">{usd(stat.p50)}</span> · p75{" "}
            <span className="font-mono text-tx">{usd(stat.p75)}</span>
            <span className="text-tx3"> — stated ranges only, not a market survey.</span>
          </p>
        )}
      </section>

      <div className="mt-6">
        <OfferCompare />
      </div>
    </main>
  );
}

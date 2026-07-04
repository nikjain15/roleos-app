import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ReviewRunner from "@/components/ReviewRunner";
import type { WeeklyReview } from "@/components/ReviewRunner";

/**
 * X7 — the weekly strategy review page. Renders the latest stored review
 * (free) and lets the user run a fresh one (their click = the model call).
 * RLS-scoped reads; pivots link back to the screens where they'd act.
 */
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/review");

  const { data } = await supabase
    .from("notifications")
    .select("payload, created_at")
    .eq("kind", "weekly_review")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const initial = (data?.payload as (WeeklyReview & { week_of?: string }) | null) ?? null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx2">
          ← back to your feed
        </Link>
        <span className="font-mono text-xs text-tx3">weekly review · step back, then aim</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Your weekly strategy review</h1>
      <p className="mt-2 max-w-xl text-[15px] text-tx2">
        Once a week, RO steps back from the day-to-day: your pace against the plan, what the
        numbers say is working, and the pivots worth making — candidly, with you as a person
        first.
      </p>

      <div className="mt-8">
        <ReviewRunner initial={initial} generatedAt={data?.created_at ?? null} />
      </div>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadActiveGoal } from "@/lib/goal";
import GoalSetter from "@/components/GoalSetter";
import GoalSwitcher, { type AltGoal } from "@/components/GoalSwitcher";

/**
 * Goal Setter page (goal-engine.md §1) — the spine's entry point. Prefills the
 * active goal (if any) with its freshly-computed plan, so returning here shows the
 * current pace and lets the user re-plan. RLS-scoped.
 */
export const dynamic = "force-dynamic";

export default async function GoalPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/goal");

  const { goal, plan } = await loadActiveGoal(supabase);
  const initial = goal ? { ...goal, plan } : null;

  // W7: the user's alternate goals (paused/achieved; archived stay listed 10-max
  // so they can be re-activated). RLS-scoped.
  const { data: others } = await supabase
    .from("goals")
    .select("id, target, deadline_date, status")
    .neq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(10);
  const alternates: AltGoal[] = (others ?? []).map((g) => {
    const t = (g.target ?? {}) as { seniority?: string; archetype?: string };
    return {
      id: g.id as string,
      label: [t.seniority, t.archetype].filter(Boolean).join(" ") || "Untitled goal",
      status: g.status as string,
      deadline: (g.deadline_date as string | null) ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx2">
          ← back to your feed
        </Link>
        <span className="font-mono text-xs text-tx3">the spine · your goal drives the hunt</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">
        {goal ? "Your goal" : "Set your goal"}
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] text-tx2">
        Tell me what you want and by when. I&apos;ll turn it into a real plan — the funnel, your
        weekly pace, and an honest read on whether it&apos;s feasible. Change it any time and the
        whole plan recomputes.
      </p>

      <div className="mt-8">
        <GoalSetter initial={initial} />
      </div>
      <GoalSwitcher alternates={alternates} />
    </main>
  );
}

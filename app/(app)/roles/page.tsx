import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { toVerdict, locationText, type WorkspaceRole } from "@/lib/workspace";
import RolesWorkspace from "@/components/RolesWorkspace";

/**
 * Roles Workspace (Slice 5, Phase A) — the home for Discover + Match. Reads the
 * user's already-reasoned matches (RLS-scoped) and lets them sort, filter, save,
 * dismiss, and pursue a worked shortlist — no onboarding re-run. "Pursue" bridges
 * to the résumé studio.
 */
export const dynamic = "force-dynamic";

type MatchRow = {
  role_id: string;
  fit_score: number | null;
  reasoning: { why?: string } | null;
  gaps: unknown;
  recommendation: string | null;
  status: string;
  created_at: string;
  roles: { company: string; role_title: string; url: string | null; location: unknown } | null;
};

export default async function RolesPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/roles");

  const { data: matches } = await supabase
    .from("matches")
    .select("role_id, fit_score, reasoning, gaps, recommendation, status, created_at, roles(company, role_title, url, location)")
    .order("fit_score", { ascending: false })
    .returns<MatchRow[]>();

  const rows: WorkspaceRole[] = (matches ?? []).map((m) => {
    const loc = locationText(m.roles?.location);
    const gaps = Array.isArray(m.gaps)
      ? (m.gaps as unknown[]).map((g) => (typeof g === "string" ? g : JSON.stringify(g))).slice(0, 8)
      : [];
    return {
      role_id: m.role_id,
      fit: m.fit_score,
      verdict: toVerdict(m.recommendation),
      company: m.roles?.company ?? "Unknown",
      title: m.roles?.role_title ?? "Role",
      location: loc.text,
      remote: loc.remote,
      url: m.roles?.url ?? null,
      why: m.reasoning?.why ?? null,
      gaps,
      status: m.status,
      created_at: m.created_at,
    };
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx2">
          ← back to your feed
        </Link>
        <span className="font-mono text-xs text-tx3">roles · your worked shortlist</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Roles workspace</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-tx2">
        Every role RO lined up for you, with the fit and the reasoning. Sort, filter, save the
        strong ones, dismiss the wrong ones — then pursue the best to tailor a résumé.
      </p>

      <div className="mt-8">
        <RolesWorkspace initial={rows} />
      </div>
    </main>
  );
}

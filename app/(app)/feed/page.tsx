import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import SaveOnboarding from "@/components/SaveOnboarding";
import SignOut from "@/components/SignOut";
import TailorButton from "@/components/TailorButton";
import { isAdmin } from "@/lib/admin";
import DigestCard from "@/components/DigestCard";

/**
 * The decision feed — the home (journey.html §6). No tabs, no Kanban. What RO
 * did, what needs your judgment, in her voice. Server component: reads the
 * signed-in user's matches (RLS-scoped). <SaveOnboarding> persists pending
 * onboarding work on first arrival, then refreshes.
 */
export const dynamic = "force-dynamic";

type MatchRow = {
  role_id: string;
  fit_score: number | null;
  recommendation: string | null;
  reasoning: { why?: string } | null;
  status: string;
  roles: { company: string; role_title: string; url: string | null } | null;
};

export default async function Feed() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/feed");

  const { data: matches } = await supabase
    .from("matches")
    .select("role_id, fit_score, recommendation, reasoning, status, roles(company, role_title, url)")
    .order("fit_score", { ascending: false })
    .returns<MatchRow[]>();

  const pursue = (matches ?? []).filter((m) => m.recommendation === "pursue");
  const rest = (matches ?? []).filter((m) => m.recommendation !== "pursue");
  const admin = await isAdmin();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <SaveOnboarding />

      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="rounded-md bg-info px-2 py-0.5 text-[13px] text-white">RO</span>
          RoleOS
        </span>
        <div className="flex items-center gap-3">
          {admin && (
            <Link href="/admin" className="text-sm text-tx3 hover:text-info">
              Admin
            </Link>
          )}
          <Link href="/settings" className="text-sm text-tx3 hover:text-info">
            Settings
          </Link>
          <SignOut />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-suc">
          <span className="inline-block h-2 w-2 rounded-full bg-suc" /> RO is working · in the background
        </span>
        <div className="flex gap-2">
          <Link
            href="/watch"
            className="rounded-md border border-info bg-info-bg px-3 py-1.5 text-xs font-medium text-info-tx"
          >
            Keep me in the loop →
          </Link>
          <Link
            href="/studio/recruiter"
            className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2"
          >
            Recruiter desk →
          </Link>
          <Link
            href="/studio/negotiate"
            className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2"
          >
            Negotiate an offer →
          </Link>
          <Link
            href="/studio/build"
            className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2"
          >
            Build studio →
          </Link>
        </div>
      </div>

      {/* RO's ambient digest — what she did / what needs you, on your cadence */}
      {matches && matches.length > 0 && <DigestCard />}

      {!matches || matches.length === 0 ? (
        <div className="mt-8 rounded-xl border border-bd bg-surf2 p-6">
          <p className="text-[15px] text-tx">
            Nothing needs you right now — I&apos;m just getting started. Paste your background and
            I&apos;ll line up roles worth your time.
          </p>
          <Link
            href="/onboarding"
            className="mt-4 inline-block rounded-md bg-info px-4 py-2 text-sm font-medium text-white"
          >
            Show RO your work
          </Link>
        </div>
      ) : (
        <>
          <h1 className="mt-8 text-xl font-bold tracking-tight">
            I&apos;ve been at it — here&apos;s where we are
          </h1>
          <p className="mt-1 text-sm text-tx3">
            {pursue.length} worth pursuing · {matches.length} I&apos;m tracking. You make the calls.
          </p>

          {pursue.length > 0 && (
            <section className="mt-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tx3">
                Needs your judgment
              </p>
              <div className="space-y-3">
                {pursue.map((m) => (
                  <Card key={m.role_id} m={m} />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section className="mt-8">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tx3">
                {pursue.length > 0 ? "Also tracking" : "Worth a look — your call"}
              </p>
              {pursue.length === 0 && (
                <p className="mb-3 text-sm text-tx2">
                  Nothing&apos;s a slam-dunk &ldquo;pursue&rdquo; against your profile this week, and I&apos;d
                  rather say that than pad the list. But these are real maybes — open any one and I&apos;ll
                  tailor your résumé to it, build a portfolio piece, or run a mock. Or{" "}
                  <Link href="/watch" className="font-medium text-info hover:underline">
                    tell me exactly what you&apos;re after
                  </Link>{" "}
                  and I&apos;ll widen the hunt.
                </p>
              )}
              <div className="space-y-3">
                {rest.map((m) => (
                  <Card key={m.role_id} m={m} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Card({ m }: { m: MatchRow }) {
  const recColor =
    m.recommendation === "pursue"
      ? "bg-suc-bg text-suc"
      : m.recommendation === "maybe"
        ? "bg-warn-bg text-warn"
        : "bg-surf2 text-tx3";
  return (
    <article className="rounded-xl border border-bd bg-surf p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-tx">
          {m.roles?.company} — {m.roles?.role_title}
        </p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${recColor}`}>
          {m.recommendation} · {m.fit_score}
        </span>
      </div>
      {m.reasoning?.why && <p className="mt-2 text-[15px] leading-relaxed text-tx2">{m.reasoning.why}</p>}
      {/* Actions on EVERY match — RO recommends, you decide (ro-voice: your */}
      {/* judgment always overrides). Drafting is RO; sending stays human-gated. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <TailorButton roleId={m.role_id} />
        <Link
          href={`/studio/build?role=${m.role_id}`}
          className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2 hover:border-info"
        >
          Build a piece →
        </Link>
        <Link
          href={`/studio/coach?role=${m.role_id}`}
          className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2 hover:border-info"
        >
          Practice the interview →
        </Link>
        {m.roles?.url && (
          <a
            href={m.roles.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2 hover:border-info"
          >
            View posting ↗
          </a>
        )}
      </div>
    </article>
  );
}

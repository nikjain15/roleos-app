import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import SaveOnboarding from "@/components/SaveOnboarding";
import TailorButton from "@/components/TailorButton";
import { isAdmin } from "@/lib/admin";
import DigestCard from "@/components/DigestCard";
import RematchButton from "@/components/RematchButton";
import GoalCockpit from "@/components/GoalCockpit";
import PaceNudgeCard from "@/components/PaceNudgeCard";
import { hasGoogleConnected } from "@/lib/google-auth";
import { loadActiveGoal, appsThisWeek } from "@/lib/goal";
import { computeAgenda } from "@/lib/plan/agenda";
import { adjustFit, loadOutcomeModel, roleFeatures, type FitAdjustment } from "@/lib/outcome-learning";

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
  reasoning: { why?: string; taste?: { delta: number; reason: string } | null } | null;
  status: string;
  roles: {
    company: string;
    role_title: string;
    url: string | null;
    archetype: string | null;
    keywords: unknown;
  } | null;
};

export default async function Feed() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/feed");

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "role_id, fit_score, recommendation, reasoning, status, roles(company, role_title, url, archetype, keywords)",
    )
    .limit(100)
    .order("fit_score", { ascending: false })
    .returns<MatchRow[]>();

  // X4: the user's real funnel outcomes nudge displayed fit — bounded, explained,
  // derived fresh each render. No outcomes yet → adj is always null, page unchanged.
  const { lifts } = await loadOutcomeModel(supabase);
  const adjFor = (m: MatchRow): FitAdjustment | null => adjustFit(m.fit_score, roleFeatures(m.roles), lifts);

  const pursue = (matches ?? []).filter((m) => m.recommendation === "pursue");
  const rest = (matches ?? []).filter((m) => m.recommendation !== "pursue");
  const admin = await isAdmin();

  // Goal cockpit (the spine): status + Today agenda. Graceful when no goal set.
  const { plan } = await loadActiveGoal(supabase);
  const { count: readyCount } = await supabase
    .from("artifacts")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");
  const sentThisWeek = plan ? await appsThisWeek(supabase) : 0;
  // X10: the overnight queue's size — a non-empty queue leads the feed.
  const { count: queueCount } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("stage", "ready");
  // X9: does the reply desk apply to this user? (A scan is model-work, so the
  // feed only links when Gmail is connected — the count lives on the desk.)
  const replyDeskOn = await hasGoogleConnected(user.id);
  const agenda = plan
    ? computeAgenda({
        plan,
        pursueRoles: pursue.length,
        readyArtifacts: readyCount ?? 0,
        appsThisWeek: sentThisWeek,
      })
    : [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <SaveOnboarding />

      {/* Primary nav (logo · sections · settings · sign-out) is the app shell's AppNav. */}
      {admin && (
        <div className="flex justify-end">
          <Link href="/admin" className="text-xs text-tx3 hover:text-primary">
            Admin →
          </Link>
        </div>
      )}

      {/* Proactive, wellbeing-gated pace nudge (only when off-pace) */}
      <PaceNudgeCard />

      {/* X10: the overnight queue — real work waiting on real judgment. */}
      {(queueCount ?? 0) > 0 && (
        <section className="mt-6 rounded-xl border border-primary bg-info-bg p-4">
          <p className="text-[15px] font-medium text-info-tx">
            Your overnight queue: {queueCount} ready for review.
          </p>
          <p className="mt-1 text-sm text-tx2">
            Drafted and truth-checked while you were away — one decision at a time, sends stay yours.
          </p>
          <Link
            href="/ready-room"
            className="mt-3 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white"
          >
            Open the ready-room →
          </Link>
        </section>
      )}

      {/* X9: the reply desk — live threads where the ball's in your court. */}
      {replyDeskOn && (
        <section className="mt-6 rounded-xl border border-bd bg-surf2 p-4">
          <p className="text-[15px] font-medium text-tx">Threads waiting on you</p>
          <p className="mt-1 text-sm text-tx2">
            I keep an eye on your recruiter mail. When one needs a reply, a scheduling answer, or a
            nudge, I&apos;ll have a draft ready — you send it yourself.
          </p>
          <Link
            href="/reply-desk"
            className="mt-3 inline-flex min-h-10 items-center rounded-md border border-primary px-4 text-sm font-medium text-info-tx"
          >
            Open the reply desk →
          </Link>
        </section>
      )}

      {/* The spine: goal status + Today agenda (or a set-your-goal CTA) */}
      <GoalCockpit plan={plan} agenda={agenda} />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-suc">
          <span className="inline-block h-2 w-2 rounded-full bg-suc" /> RO is working · in the background
        </span>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/roles"
            className="rounded-md border border-primary bg-info-bg px-3 py-1.5 text-xs font-medium text-info-tx"
          >
            Roles →
          </Link>
          <Link
            href="/tracker"
            className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2"
          >
            Tracker →
          </Link>
          <Link
            href="/watch"
            className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2"
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
            href="/start"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Show RO your work
          </Link>
        </div>
      ) : (
        <>
          <h1 className="mt-8 text-xl font-bold tracking-tight">
            I&apos;ve been at it — here&apos;s where we are
          </h1>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-tx3">
              {pursue.length} worth pursuing · {matches.length} I&apos;m tracking. You make the calls.
            </p>
            <RematchButton />
          </div>

          {pursue.length > 0 && (
            <section className="mt-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tx3">
                Needs your judgment
              </p>
              <div className="space-y-3">
                {pursue.map((m) => (
                  <Card key={m.role_id} m={m} adj={adjFor(m)} />
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
                  <Link href="/watch" className="font-medium text-primary hover:underline">
                    tell me exactly what you&apos;re after
                  </Link>{" "}
                  and I&apos;ll widen the hunt.
                </p>
              )}
              <div className="space-y-3">
                {rest.map((m) => (
                  <Card key={m.role_id} m={m} adj={adjFor(m)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Card({ m, adj }: { m: MatchRow; adj?: FitAdjustment | null }) {
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
        {/* X4: base fit stays visible; the outcome overlay is labelled, never silent. */}
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${recColor}`}>
          {m.recommendation} · {m.fit_score}
          {adj && <> → {adj.adjusted}</>}
        </span>
      </div>
      {adj && (
        <p className="mt-1 text-xs text-tx3">
          {adj.delta > 0 ? "+" : ""}
          {adj.delta} from your track record:{" "}
          {adj.because.map((b) => `${b.feature} ${b.wins}/${b.n}`).join(" · ")}
        </p>
      )}
      {m.reasoning?.why && <p className="mt-2 text-[15px] leading-relaxed text-tx2">{m.reasoning.why}</p>}
      {/* P3 taste overlay — transparent: show how what RO learned moved this role. */}
      {m.reasoning?.taste && m.reasoning.taste.delta !== 0 && (
        <p className="mt-1.5 text-[13px] text-primary">
          {m.reasoning.taste.delta > 0 ? "↑ ranked up" : "↓ ranked down"} — {m.reasoning.taste.reason}
        </p>
      )}
      {/* Actions on EVERY match — RO recommends, you decide (ro-voice: your */}
      {/* judgment always overrides). Drafting is RO; sending stays human-gated. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <TailorButton roleId={m.role_id} />
        <Link
          href={`/studio/build?role=${m.role_id}`}
          className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2 hover:border-primary"
        >
          Build a piece →
        </Link>
        <Link
          href={`/studio/coach?role=${m.role_id}`}
          className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2 hover:border-primary"
        >
          Practice the interview →
        </Link>
        {m.roles?.url && (
          <a
            href={m.roles.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2 hover:border-primary"
          >
            View posting ↗
          </a>
        )}
      </div>
    </article>
  );
}

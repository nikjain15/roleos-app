import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import SaveOnboarding from "@/components/SaveOnboarding";
import TailorButton from "@/components/TailorButton";
import { isAdmin } from "@/lib/admin";
import DigestCard from "@/components/DigestCard";
import RematchButton from "@/components/RematchButton";
import { hasGoogleConnected } from "@/lib/google-auth";
import { loadActiveGoal, appsThisWeek } from "@/lib/goal";
import { computeAgenda } from "@/lib/plan/agenda";
import { adjustFit, loadOutcomeModel, roleFeatures, type FitAdjustment } from "@/lib/outcome-learning";
import { Card } from "@/components/ui";
import { StreakCard, MomentumAspects, PathConstellation } from "@/components/feed/Motivation";
import { TodayActions } from "@/components/feed/TodayActions";
import { loadFeedStats } from "@/lib/feed/model";

/**
 * The gamified daily cockpit (docs/specs/feed-gamified.md). Win first — streak ·
 * momentum · path — then a short finishable list, then the rich plays. Server
 * component, RLS-scoped. Built on the design system. <SaveOnboarding> persists
 * pending onboarding on first arrival.
 */
export const dynamic = "force-dynamic";

type MatchRow = {
  role_id: string;
  fit_score: number | null;
  recommendation: string | null;
  reasoning: { why?: string; taste?: { delta: number; reason: string } | null } | null;
  status: string;
  roles: { company: string; role_title: string; url: string | null; archetype: string | null; keywords: unknown } | null;
};

export default async function Feed() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/feed");

  const today = new Date().toISOString().slice(0, 10); // UTC calendar day

  const [{ data: matches }, stats, { plan }, admin, replyDeskOn] = await Promise.all([
    supabase
      .from("matches")
      .select("role_id, fit_score, recommendation, reasoning, status, roles(company, role_title, url, archetype, keywords)")
      .limit(100)
      .order("fit_score", { ascending: false })
      .returns<MatchRow[]>(),
    loadFeedStats(supabase, user.id, today),
    loadActiveGoal(supabase),
    isAdmin(),
    hasGoogleConnected(user.id),
  ]);

  const { lifts } = await loadOutcomeModel(supabase);
  const adjFor = (m: MatchRow): FitAdjustment | null => adjustFit(m.fit_score, roleFeatures(m.roles), lifts);
  const pursue = (matches ?? []).filter((m) => m.recommendation === "pursue");
  const rest = (matches ?? []).filter((m) => m.recommendation !== "pursue");

  // Goal pace + week-of-plan for the momentum/path.
  const { count: readyCount } = await supabase.from("artifacts").select("id", { count: "exact", head: true }).eq("status", "approved");
  const sentThisWeek = plan ? await appsThisWeek(supabase) : 0;
  const { count: queueCount } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("stage", "ready");
  const { data: goalRow } = await supabase.from("goals").select("created_at").eq("status", "active").maybeSingle<{ created_at: string }>();

  const weeks = plan?.weeksToApplyBy ?? null;
  const currentWeek = goalRow?.created_at && weeks
    ? Math.min(weeks, Math.max(1, Math.ceil((Date.parse(`${today}T00:00:00Z`) - Date.parse(goalRow.created_at)) / (7 * 86_400_000)) || 1))
    : null;
  const onTrack = plan ? sentThisWeek >= (plan.weekly?.applications ?? 1) : false;

  const agenda = plan ? computeAgenda({ plan, pursueRoles: pursue.length, readyArtifacts: readyCount ?? 0, appsThisWeek: sentThisWeek }) : [];
  const hook = stats.streak > 0 ? "Momentum is on your side." : (matches?.length ?? 0) > 0 ? "Let's put a move on the board." : "Let's get you started.";
  const hasData = (matches?.length ?? 0) > 0 || stats.streak > 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <SaveOnboarding />
      {admin && (
        <div className="flex justify-end">
          <Link href="/admin" className="text-small text-tx3 hover:text-primary">Admin →</Link>
        </div>
      )}

      {!hasData ? (
        <Card elevation="flat" className="mt-4">
          <p className="text-body text-tx">Nothing needs you yet — I&rsquo;m just getting started. Show me your work and I&rsquo;ll line up roles worth your time.</p>
          <Link href="/start" className="mt-4 inline-block rounded-xl bg-primary px-4 py-2.5 text-small font-semibold text-primary-tx">Show RO your work</Link>
        </Card>
      ) : (
        <>
          {/* ── WIN FIRST: the motivation layer ── */}
          <p className="mt-2 text-small font-medium text-tx3">Good day, let&rsquo;s go</p>
          <h1 className="mt-1 font-display text-h1 font-bold text-tx">
            {hook.split(" on ")[0]}{hook.includes(" on ") ? <> on <span className="text-primary">your side.</span></> : ""}
          </h1>

          <div className="mt-5 flex flex-col gap-2.5">
            <StreakCard streak={stats.streak} week={stats.week} />
            <MomentumAspects momentum={stats.momentum} ratio={stats.pace.ratio} week={currentWeek} weeks={weeks} onTrack={onTrack} />
            {(matches?.length ?? 0) > 0 && (
              <PathConstellation path={stats.path} goalLabel={plan ? `Senior AI PM` : "your goal"} onTrack={onTrack} />
            )}
          </div>

          {/* ── THEN THE WORK ── */}
          {agenda.length > 0 && (
            <div className="mt-8">
              <TodayActions
                items={agenda.map((a) => ({ id: a.id, title: a.title, detail: a.detail, href: a.href }))}
                movesToday={stats.movesToday}
              />
            </div>
          )}

          {/* Demoted judgment-calls (kept): overnight queue + reply desk */}
          {((queueCount ?? 0) > 0 || replyDeskOn) && (
            <div className="mt-4 flex flex-col gap-2.5">
              {(queueCount ?? 0) > 0 && (
                <Card elevation="flat" className="flex flex-wrap items-center gap-3">
                  <span className="text-body text-tx">🗂️ <b className="font-semibold">{queueCount} ready for your review</b> — drafted overnight, sends stay yours.</span>
                  <Link href="/ready-room" className="ml-auto rounded-full bg-primary px-3.5 py-2 text-small font-semibold text-primary-tx">Open ready-room →</Link>
                </Card>
              )}
              {replyDeskOn && (
                <Card elevation="flat" className="flex flex-wrap items-center gap-3">
                  <span className="text-body text-tx">✉️ <b className="font-semibold">Threads waiting on you</b> — a draft&rsquo;s ready, you send it.</span>
                  <Link href="/reply-desk" className="ml-auto rounded-full border border-bd px-3.5 py-2 text-small font-semibold text-tx2 hover:border-primary">Reply desk →</Link>
                </Card>
              )}
            </div>
          )}

          {/* ── BROWSE: the rich plays ── */}
          <section className="mt-8">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-overline font-semibold uppercase text-tx3">Plays worth your time · {pursue.length} pursue · {matches?.length ?? 0} tracked</span>
              <RematchButton />
            </div>
            <div className="flex flex-col gap-2.5">
              {pursue.slice(0, 3).map((m) => <PlayCard key={m.role_id} m={m} adj={adjFor(m)} />)}
            </div>
            {(pursue.length > 3 || rest.length > 0) && (
              <details className="mt-2.5">
                <summary className="cursor-pointer rounded-xl border border-bd bg-surf py-2.5 text-center text-small font-semibold text-tx2 hover:bg-surf2">
                  Show {pursue.length - Math.min(3, pursue.length) + rest.length} more
                </summary>
                <div className="mt-2.5 flex flex-col gap-2.5">
                  {[...pursue.slice(3), ...rest].map((m) => <PlayCard key={m.role_id} m={m} adj={adjFor(m)} />)}
                </div>
              </details>
            )}
          </section>

          {/* ── Transparency: what RO did (its own card) ── */}
          <div className="mt-8">
            <DigestCard />
          </div>
        </>
      )}
    </main>
  );
}

/** A rich match card — RO's reasoning + the P3 taste overlay + actions. */
function PlayCard({ m, adj }: { m: MatchRow; adj?: FitAdjustment | null }) {
  const recColor =
    m.recommendation === "pursue" ? "bg-suc-bg text-suc" : m.recommendation === "maybe" ? "bg-warn-bg text-warn" : "bg-surf2 text-tx3";
  return (
    <Card elevation="flat">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-tx">{m.roles?.company} — {m.roles?.role_title}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-overline font-semibold ${recColor}`}>
          {m.recommendation} · {m.fit_score}{adj && <> → {adj.adjusted}</>}
        </span>
      </div>
      {adj && (
        <p className="mt-1 text-small text-tx3">
          {adj.delta > 0 ? "+" : ""}{adj.delta} from your track record: {adj.because.map((b) => `${b.feature} ${b.wins}/${b.n}`).join(" · ")}
        </p>
      )}
      {m.reasoning?.why && <p className="mt-2 text-body leading-relaxed text-tx2">{m.reasoning.why}</p>}
      {m.reasoning?.taste && m.reasoning.taste.delta !== 0 && (
        <p className="mt-1.5 text-small font-semibold text-primary">
          {m.reasoning.taste.delta > 0 ? "↑ ranked up" : "↓ ranked down"} — {m.reasoning.taste.reason}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <TailorButton roleId={m.role_id} />
        <Link href={`/studio/build?role=${m.role_id}`} className="rounded-md border border-bd px-3 py-1.5 text-small text-tx2 hover:border-primary">Build a piece →</Link>
        <Link href={`/studio/coach?role=${m.role_id}`} className="rounded-md border border-bd px-3 py-1.5 text-small text-tx2 hover:border-primary">Practice the interview →</Link>
        {m.roles?.url && <a href={m.roles.url} target="_blank" rel="noreferrer" className="rounded-md border border-bd px-3 py-1.5 text-small text-tx2 hover:border-primary">View posting ↗</a>}
      </div>
    </Card>
  );
}

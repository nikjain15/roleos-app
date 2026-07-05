import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadOutcomeModel, roleFeatures } from "@/lib/outcome-learning";
import { buildReflection, type ReflectionScore } from "@/lib/rejection-growth";
import ReflectionClient from "@/components/ReflectionClient";

/**
 * X11 — the rejection→growth reflection. Offered, never forced: a calm,
 * deterministic two-minute post-mortem grounded in the user's own funnel data
 * (X4 lifts + X3 score) — zero model calls, so nothing is invented. Server
 * component: RLS-scoped, owner + rejected only. It reflects and records a
 * reason; it changes nothing and sends nothing.
 */
export const dynamic = "force-dynamic";

export default async function Reflect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/reflect/${id}`);

  const { data: app } = await supabase
    .from("applications")
    .select("id, stage, role_id, artifact_ids")
    .eq("id", id)
    .single<{ id: string; stage: string; role_id: string | null; artifact_ids: string[] | null }>();

  // Owner is enforced by RLS (null when not yours); reflection is rejected-only.
  if (!app || app.stage !== "rejected") redirect("/tracker");

  const [{ data: role }, { lifts }, { data: reflected }] = await Promise.all([
    app.role_id
      ? supabase
          .from("roles")
          .select("id, company, role_title, archetype, keywords")
          .eq("id", app.role_id)
          .maybeSingle<{ id: string; company: string; role_title: string; archetype: string | null; keywords: unknown }>()
      : Promise.resolve({ data: null }),
    loadOutcomeModel(supabase),
    supabase
      .from("decision_events")
      .select("payload")
      .eq("kind", "reflection")
      .eq("subject_ref", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ payload: { reason?: string } | null }>(),
  ]);

  // X3 score for this application's newest résumé, if present.
  let score: ReflectionScore | null = null;
  const artIds = app.artifact_ids ?? [];
  if (artIds.length) {
    const { data: art } = await supabase
      .from("artifacts")
      .select("provenance")
      .in("id", artIds)
      .limit(50)
      .returns<{ provenance: { app_score?: { score?: number; screen_likelihood?: string } } | null }[]>();
    const s = (art ?? []).map((a) => a.provenance?.app_score).find((x) => x && typeof x.score === "number");
    if (s && typeof s.score === "number") {
      score = { score: s.score, likelihood: String(s.screen_likelihood ?? "") };
    }
  }

  const reflection = buildReflection({ features: roleFeatures(role), lifts, score });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/tracker" className="text-sm text-tx2">
          ← back to your tracker
        </Link>
        <span className="font-mono text-xs text-tx3">a moment, not a metric</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">
        {role ? (
          <>
            {role.role_title} <span className="font-normal text-tx3">· {role.company}</span>
          </>
        ) : (
          "This one didn't land"
        )}
      </h1>

      <p className="mt-4 text-[15px] text-tx">{reflection.acknowledgment}</p>

      <section className="mt-5 rounded-xl border border-bd bg-surf p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">What the data actually says</p>
        <ul className="mt-2 space-y-2 text-[14px] text-tx2">
          {reflection.dataPoints.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>

        <div className="mt-4 rounded-lg bg-info-bg p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-info-tx">One thing to try next</p>
          <p className="mt-1 text-[14px] text-tx">{reflection.oneAdjustment.text}</p>
        </div>
      </section>

      <ReflectionClient
        applicationId={app.id}
        reasonOptions={reflection.reasonOptions}
        savedReason={reflected?.payload?.reason ?? null}
      />

      <p className="mt-4 text-[12px] text-tx3">
        That&apos;s the whole thing — no streak, nothing to keep up. Closing this tab is a perfectly
        good next move.
      </p>
    </main>
  );
}

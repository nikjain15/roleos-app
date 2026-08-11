import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import PresenceClient, {
  type FeedbackRow,
  type ItemRow,
  type RunRow,
  type SourceRow,
} from "@/components/PresenceClient";
import { DEFAULT_RANK_CONFIG, type RankConfig } from "@/lib/presence/rank";

/**
 * Presence — the inbound half of the system. Roles and Tracker are the user
 * going to the market; Presence is the market coming to them (inbound measured
 * at 4 genuine approaches in ~20 months, the thinnest part of the search).
 *
 * Four views in pipeline order: Sources bring posts in, the Feed shows them
 * scored, the Filter is what you tune, and Respond is the daily workspace and
 * therefore the default. Collection runs in the cron worker (phase 1:
 * deterministic, no model); the human writes and posts every comment.
 */
export const dynamic = "force-dynamic";

export default async function Presence() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/presence");

  const { data: run } = await supabase
    .from("presence_runs")
    .select("id, at, requests, cost_usd, fetched, new_items, kept, dropped, per_source, dropped_by_reason")
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle<RunRow>();

  const { data: items } = run
    ? await supabase
        .from("presence_items")
        .select("id, source_id, url, platform, author, author_headline, body, posted_at, engagement, age_hours, score, hits, status, drop_reason")
        .eq("run_id", run.id)
        .order("score", { ascending: false })
        .limit(500)
        .returns<ItemRow[]>()
    : { data: [] as ItemRow[] };

  const { data: sources } = await supabase
    .from("presence_sources")
    .select("id, slug, platform, type, value, query, enabled, interval_hours, last_polled_at, last_fetched, last_unseen, last_fill_rate, last_error")
    .order("created_at", { ascending: true })
    .limit(200)
    .returns<SourceRow[]>();

  const { data: feedback } = await supabase
    .from("presence_feedback")
    .select("url, verdict, note")
    .limit(1000)
    .returns<FeedbackRow[]>();

  const { data: settings } = await supabase
    .from("presence_settings")
    .select("scoring")
    .maybeSingle();
  const cfg: RankConfig = { ...DEFAULT_RANK_CONFIG, ...((settings?.scoring as Partial<RankConfig> | null) ?? {}) };

  return (
    <PresenceClient
      run={run ?? null}
      items={items ?? []}
      sources={sources ?? []}
      feedback={feedback ?? []}
      cfg={cfg}
    />
  );
}

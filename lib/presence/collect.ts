/**
 * Presence collector: the poll.mjs pipeline from the local console, rewritten
 * against Supabase so it runs from the cron worker with the laptop shut.
 *
 * Per user: find due sources, fetch, dedupe against every URL ever seen,
 * filter and rank deterministically (lib/presence/rank), store items with what
 * happened to them, and record the run. Phase 1 finds posts; it does not
 * draft, and nothing here sends anything anywhere.
 *
 * Called with the SERVICE-ROLE client by /api/cron/presence only — every
 * query is explicitly scoped to user_id because RLS is bypassed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSource, COST_PER_REQUEST, type SourceDef } from "@/lib/presence/apidirect";
import {
  rank, DEFAULT_RANK_CONFIG,
  type PresenceItem, type RankConfig,
} from "@/lib/presence/rank";

// Cost backstop, not a tuning knob: the lean source set is ~12 requests/day
// (~$1.20/month). If a run ever wants more than this, something is misconfigured
// and the remainder waits for the next tick rather than billing through it.
const MAX_REQUESTS_PER_RUN = 40;

interface SourceRow {
  id: string;
  slug: string;
  platform: string;
  type: string;
  value: string;
  query: string | null;
  enabled: boolean;
  interval_hours: number;
  pages_per_poll: number;
  last_polled_at: string | null;
  fill_history: number[];
}

export interface PerSourceReport {
  slug: string;
  type: string;
  platform: string;
  fetched: number;
  unseen: number;
  fill_rate: number;
  advice: string;
  failed: string | null;
}

export interface CollectResult {
  polled: number;
  requests: number;
  cost_usd: number;
  new_items: number;
  kept: number;
  dropped: number;
}

function isDue(s: SourceRow, now: number, force: boolean): boolean {
  if (force) return true;
  if (!s.last_polled_at) return true;
  const hours = (now - new Date(s.last_polled_at).getTime()) / 36e5;
  return hours >= (s.interval_hours ?? 24);
}

/**
 * Fill rate is how many of the returned posts were unseen: the signal that
 * decides whether a source is polled too rarely or too often, and the only
 * honest way to know whether daily polling is dropping posts.
 */
export function fillAdvice(rate: number, n: number): string {
  if (n === 0) return "no-results";
  if (rate >= 0.95) return "OVERFLOWING: shorten interval, posts are being missed";
  if (rate >= 0.3) return "healthy";
  if (rate >= 0.1) return "slow";
  return "STALE: lengthen interval, mostly re-reading";
}

/** Poll one user's due sources. Returns null when nothing was due. */
export async function collectForUser(
  db: SupabaseClient,
  userId: string,
  apiKey: string,
  { force = false }: { force?: boolean } = {},
): Promise<CollectResult | null> {
  const now = Date.now();

  const { data: sourceRows, error: srcErr } = await db
    .from("presence_sources")
    .select("id, slug, platform, type, value, query, enabled, interval_hours, pages_per_poll, last_polled_at, fill_history")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (srcErr) throw new Error(`presence_sources read: ${srcErr.message}`);

  const due = ((sourceRows ?? []) as SourceRow[]).filter((s) => isDue(s, now, force));
  if (!due.length) return null;

  const { data: settings } = await db
    .from("presence_settings")
    .select("scoring")
    .eq("user_id", userId)
    .maybeSingle();
  const cfg: RankConfig = { ...DEFAULT_RANK_CONFIG, ...((settings?.scoring as Partial<RankConfig> | null) ?? {}) };

  let requests = 0;
  const allNew: PresenceItem[] = [];
  const perSource: PerSourceReport[] = [];

  for (const s of due) {
    const def: SourceDef = { id: s.id, slug: s.slug, platform: s.platform, type: s.type, value: s.value, query: s.query };
    const pages = s.pages_per_poll ?? 1;
    const fetched: PresenceItem[] = [];
    let failed: string | null = null;

    for (let page = 1; page <= pages; page++) {
      if (requests >= MAX_REQUESTS_PER_RUN) { failed = "request-cap"; break; }
      try {
        const items = await fetchSource(def, apiKey, { page });
        requests++;
        if (!items.length) break;
        fetched.push(...items);
        if (items.length < 20) break; // short page means no more results
      } catch (e) {
        failed = e instanceof Error ? e.message : String(e);
        break;
      }
    }

    // Cross-run dedupe: a post is only scored the first time it appears.
    const urls = [...new Set(fetched.map((it) => it.url).filter((u): u is string => Boolean(u)))];
    let seen = new Set<string>();
    if (urls.length) {
      const { data: seenRows } = await db
        .from("presence_items")
        .select("url")
        .eq("user_id", userId)
        .in("url", urls);
      seen = new Set((seenRows ?? []).map((r) => r.url as string));
    }
    const unseen = fetched.filter((it) => it.url && !seen.has(it.url));

    const rate = fetched.length ? unseen.length / fetched.length : 0;
    perSource.push({
      slug: s.slug, type: s.type, platform: s.platform,
      fetched: fetched.length, unseen: unseen.length,
      fill_rate: Number(rate.toFixed(2)), advice: fillAdvice(rate, fetched.length), failed,
    });

    await db.from("presence_sources").update({
      last_polled_at: new Date(now).toISOString(),
      last_fetched: fetched.length,
      last_unseen: unseen.length,
      last_fill_rate: Number(rate.toFixed(2)),
      last_error: failed,
      fill_history: [...(s.fill_history ?? []), Number(rate.toFixed(2))].slice(-14),
    }).eq("id", s.id);

    allNew.push(...unseen);
  }

  const { kept, dropped } = rank(allNew, cfg, now);
  const droppedByReason = dropped.reduce<Record<string, number>>((acc, d) => {
    const k = d.reason.split(":")[0];
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const { data: runRow, error: runErr } = await db
    .from("presence_runs")
    .insert({
      user_id: userId,
      requests,
      cost_usd: Number((requests * COST_PER_REQUEST).toFixed(4)),
      fetched: perSource.reduce((a, s) => a + s.fetched, 0),
      new_items: allNew.length,
      kept: kept.length,
      dropped: dropped.length,
      per_source: perSource,
      dropped_by_reason: droppedByReason,
      config: cfg,
    })
    .select("id")
    .single();
  if (runErr) throw new Error(`presence_runs insert: ${runErr.message}`);
  const runId = runRow.id as string;

  const toRow = (it: PresenceItem, status: "kept" | "dropped", extra: Record<string, unknown>) => ({
    user_id: userId,
    source_id: it.source_id,
    run_id: runId,
    url: it.url,
    platform: it.platform,
    author: it.author,
    author_headline: it.author_headline,
    title: it.title,
    body: it.body,
    posted_at: it.posted_at,
    engagement: it.engagement,
    status,
    ...extra,
  });

  const rows = [
    ...kept.map((it) => toRow(it, "kept", { score: it.score, hits: it.hits, age_hours: it.age_hours == null ? null : Number(it.age_hours.toFixed(1)) })),
    ...dropped.map((d) => toRow(d.item, "dropped", { drop_reason: d.reason })),
  ];

  // Batched inserts; ignoreDuplicates so two sources returning the same URL in
  // one run cannot fail the whole batch on the (user_id, url) unique index.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db
      .from("presence_items")
      .upsert(rows.slice(i, i + 200), { onConflict: "user_id,url", ignoreDuplicates: true });
    if (error) throw new Error(`presence_items insert: ${error.message}`);
  }

  return {
    polled: due.length,
    requests,
    cost_usd: Number((requests * COST_PER_REQUEST).toFixed(4)),
    new_items: allNew.length,
    kept: kept.length,
    dropped: dropped.length,
  };
}

/**
 * Ingestion · YC source (docs/admin-ingestion.md). Pulls the **yc-oss public
 * company API** — a daily-rebuilt JSON mirror of YC's own Algolia directory — and
 * upserts companies into the admin-managed `companies` scan list. This is the
 * cheap, ToS-clean "company layer": once a YC company is a row, the existing
 * scan → extract → embed → prune pipeline sources its roles on the normal cadence
 * (lib/ingest/index.ts). No new role pipeline; YC is just a feeder for `companies`.
 *
 * Design:
 *  • `hiring` dataset by default (companies YC flags as actively hiring) — the
 *    sourcing funnel; `all` is available for a full-universe sweep.
 *  • slug = companySlug(name) so the try-all ATS fetchers (greenhouse/ashby/lever)
 *    resolve the same way they do for seed rows; ats_provider stays null (try-all).
 *  • Net-new only: existing slugs (seed config or already-synced YC rows) are left
 *    untouched, so admin enable/disable + seed ATS providers are never clobbered.
 *  • ENABLE BUDGET: scan.ts now pages the company list instead of reading a flat
 *    500 rows, so the old truncation risk is gone and the budget exists only to
 *    pace growth. Anything over it lands as an `enabled:false` candidate the
 *    admin can promote — still no silent truncation.
 *    Enabled picks are prioritized: relevant (senior product / AI / ML / data /
 *    dev-tools) first, YC "top companies" and larger teams ahead of the long tail.
 *
 * Source: https://github.com/yc-oss/api  ·  endpoints at https://yc-oss.github.io/api
 */
import { supabaseService } from "@/lib/supabase/service";
import { companySlug } from "@/lib/ats";

const ENDPOINT = {
  hiring: "https://yc-oss.github.io/api/companies/hiring.json",
  all: "https://yc-oss.github.io/api/companies/all.json",
} as const;

export type YcDataset = keyof typeof ENDPOINT;

/** Cumulative ceiling on auto-enabled YC companies. Was 250, sized to keep the
 *  enabled set under scan.ts's old flat 500-row read; scan.ts pages now, so this
 *  covers the full YC universe (~1,600 and growing). Measured yield on the tail
 *  is 0.52 in-scope roles per company, and the barren backoff moves the empty
 *  ones to a 24-day cadence after one sweep, so carrying them is cheap. */
const MAX_ENABLE_YC = 2000;

/** The shape we read from a yc-oss company record (subset of its many fields). */
interface YcCompany {
  name?: string;
  slug?: string;
  website?: string;
  one_liner?: string;
  batch?: string;
  status?: string; // Active | Acquired | Inactive | Public
  industry?: string;
  subindustry?: string;
  tags?: string[];
  team_size?: number;
  top_company?: boolean;
  isHiring?: boolean;
}

/**
 * On-target for a senior product / AI / ML hunt. Used to PRIORITIZE which
 * companies fill the enable budget (role-level relevance is still enforced later
 * by RELEVANT_TITLE in scan.ts — this is a company-level pre-sort, not the final
 * filter).
 */
const RELEVANT =
  /\b(a\.?i\.?|artificial intelligence|machine learning|\bml\b|\bmlops\b|llm|gen ?ai|generative|agents?|computer vision|nlp|data|analytics|developer tools|dev ?tools|\bapi\b|infrastructure|platform|fintech|saas|b2b)\b/i;

function isRelevant(c: YcCompany): boolean {
  const hay = [c.industry, c.subindustry, c.one_liner, ...(c.tags ?? [])]
    .filter(Boolean)
    .join(" ");
  return RELEVANT.test(hay);
}

/** Keep dead companies out of the scan list — only source live ones. */
function isLive(c: YcCompany): boolean {
  const s = (c.status ?? "").toLowerCase();
  return s === "active" || s === "public" || s === "";
}

/** Higher = enable sooner. Relevant ≫ not; top_company and team size break ties. */
function priority(c: YcCompany): number {
  return (isRelevant(c) ? 1_000_000 : 0) + (c.top_company ? 100_000 : 0) + Math.min(c.team_size ?? 0, 50_000);
}

export interface YcSyncSummary {
  dataset: YcDataset;
  fetched: number; // records in the dataset
  candidates: number; // live + named, considered for insert
  existing: number; // already in companies (skipped — net-new only)
  inserted: number; // new rows added
  enabled: number; // of the inserted, how many were enabled this run
  enableBudgetLeft: number; // remaining auto-enable headroom under MAX_ENABLE_YC
  collisions: number; // dropped because their slug duplicated another row
}

type CompanyRow = {
  name: string;
  slug: string;
  ats_provider: null;
  sector: string | null;
  enabled: boolean;
  source: "yc";
  yc_slug: string | null;
  yc_batch: string | null;
  homepage: string | null;
};

/**
 * Sync the YC company directory into `companies`. Idempotent: only slugs not
 * already present are inserted, so re-runs are cheap and never overwrite seed
 * config or admin toggles.
 */
export async function syncYcCompanies(
  opts: { dataset?: YcDataset; enableRelevant?: boolean } = {},
): Promise<YcSyncSummary> {
  const dataset = opts.dataset ?? "hiring";
  const enableRelevant = opts.enableRelevant ?? true;
  const db = supabaseService();

  const res = await fetch(ENDPOINT[dataset], {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`yc-oss ${dataset} ${res.status}`);
  const raw = (await res.json()) as YcCompany[];
  const fetched = raw.length;

  // Live, named, deduped-by-slug candidates, sorted best-first so the enable
  // budget goes to the strongest companies.
  const seen = new Set<string>();
  let collisions = 0;
  const candidates = raw
    .filter((c) => (c.name ?? "").trim() && isLive(c))
    .sort((a, b) => priority(b) - priority(a))
    .filter((c) => {
      const slug = companySlug((c.name ?? "").trim());
      if (!slug) return false;
      if (seen.has(slug)) {
        collisions++;
        return false;
      }
      seen.add(slug);
      return true;
    });

  // Net-new only: drop slugs already in the table (seed rows or prior YC syncs).
  const slugs = candidates.map((c) => companySlug((c.name ?? "").trim()));
  const existingSlugs = await fetchExistingSlugs(db, slugs);
  const fresh = candidates.filter((c) => !existingSlugs.has(companySlug((c.name ?? "").trim())));

  // Remaining auto-enable headroom = MAX_ENABLE_YC minus already-enabled YC rows.
  const { count: enabledYc } = await db
    .from("companies")
    .select("*", { count: "exact", head: true })
    .eq("source", "yc")
    .eq("enabled", true);
  let budget = enableRelevant ? Math.max(0, MAX_ENABLE_YC - (enabledYc ?? 0)) : 0;

  const rows: CompanyRow[] = fresh.map((c) => {
    const name = (c.name ?? "").trim();
    const enable = budget > 0 && isRelevant(c);
    if (enable) budget--;
    return {
      name,
      slug: companySlug(name),
      ats_provider: null,
      sector: c.industry ?? null,
      enabled: enable,
      source: "yc",
      yc_slug: c.slug ?? null,
      yc_batch: c.batch ?? null,
      homepage: c.website ?? null,
    };
  });

  // Insert in chunks (keep request bodies sane).
  let inserted = 0;
  let enabled = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db
      .from("companies")
      .upsert(chunk, { onConflict: "slug", ignoreDuplicates: true });
    if (error) throw new Error(`companies upsert: ${error.message}`);
    inserted += chunk.length;
    enabled += chunk.filter((r) => r.enabled).length;
  }

  return {
    dataset,
    fetched,
    candidates: candidates.length,
    existing: candidates.length - fresh.length,
    inserted,
    enabled,
    enableBudgetLeft: budget,
    collisions,
  };
}

/** Hard ceiling on total enabled companies. This used to be the scan's 500-row
 *  read limit minus headroom; scan.ts pages now, so it's a sanity bound on how
 *  much work one sweep can be asked to do, not a correctness constraint. */
const SCAN_ENABLE_CEILING = 3000;

export interface YcPromoteSummary {
  requested: number;
  promoted: number; // candidates flipped to enabled this call
  headroom: number; // how many more could be enabled before the ceiling
  enabledTotalNow: number; // total enabled companies (all sources) after promote
}

/**
 * Promote the top-N disabled YC candidates to enabled (admin action). Ranked by
 * the same yc-oss priority as the initial sync (relevance → top_company → team
 * size, freshly re-fetched and joined by yc_slug), so the best candidates go
 * first. Bounded by SCAN_ENABLE_CEILING so we never enable past what the scan can
 * read. Idempotent-ish: re-running just enables the next N.
 */
export async function promoteYcCandidates(count: number): Promise<YcPromoteSummary> {
  const db = supabaseService();
  const want = Math.max(0, Math.floor(count));

  // Respect the scan ceiling: headroom = ceiling − currently-enabled (all sources).
  const { count: enabledTotal } = await db
    .from("companies")
    .select("*", { count: "exact", head: true })
    .eq("enabled", true);
  const headroom = Math.max(0, SCAN_ENABLE_CEILING - (enabledTotal ?? 0));
  const n = Math.min(want, headroom);
  if (n === 0) {
    return { requested: want, promoted: 0, headroom, enabledTotalNow: enabledTotal ?? 0 };
  }

  // Disabled YC candidates.
  const { data: candidates } = await db
    .from("companies")
    .select("id, yc_slug")
    .eq("source", "yc")
    .eq("enabled", false)
    .limit(5000);
  if (!candidates?.length) {
    return { requested: want, promoted: 0, headroom, enabledTotalNow: enabledTotal ?? 0 };
  }

  // Fresh priority map by YC slug (hiring.json — cached 15m, cheap).
  const prio = await ycPriorityBySlug();
  const ranked = [...candidates]
    .sort((a, b) => (prio.get(b.yc_slug as string) ?? -1) - (prio.get(a.yc_slug as string) ?? -1))
    .slice(0, n);

  let promoted = 0;
  const ids = ranked.map((c) => c.id as string);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error, count: updated } = await db
      .from("companies")
      .update({ enabled: true }, { count: "exact" })
      .in("id", chunk);
    if (error) throw new Error(`promote update: ${error.message}`);
    promoted += updated ?? chunk.length;
  }

  return {
    requested: want,
    promoted,
    headroom: headroom - promoted,
    enabledTotalNow: (enabledTotal ?? 0) + promoted,
  };
}

/** Build a priority score per YC slug from the live hiring feed (see priority()). */
async function ycPriorityBySlug(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await fetch(ENDPOINT.hiring, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return map;
    const raw = (await res.json()) as YcCompany[];
    for (const c of raw) if (c.slug) map.set(c.slug, priority(c));
  } catch {
    /* empty map → candidates rank equally (still bounded by n) */
  }
  return map;
}

/** Look up which of these slugs already exist (chunked to keep .in() lists small). */
async function fetchExistingSlugs(
  db: ReturnType<typeof supabaseService>,
  slugs: string[],
): Promise<Set<string>> {
  const have = new Set<string>();
  for (let i = 0; i < slugs.length; i += 300) {
    const chunk = slugs.slice(i, i + 300);
    const { data } = await db.from("companies").select("slug").in("slug", chunk);
    for (const r of data ?? []) have.add(r.slug as string);
  }
  return have;
}

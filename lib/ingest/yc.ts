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
 *  • ENABLE BUDGET: the scan reads enabled companies with a 500-row ceiling
 *    (scan.ts), so we never auto-enable more than MAX_ENABLE_YC. The rest land as
 *    `enabled:false` candidates the admin can promote — no silent truncation.
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

/** Cumulative ceiling on auto-enabled YC companies. Kept well under scan.ts's
 *  500-row read so seed + demand companies still fit and nothing is silently
 *  dropped at scan time. Tune up only alongside the scan limit. */
const MAX_ENABLE_YC = 250;

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

/**
 * Speedrun (a16z) as a COMPANY source — deliberately not a role source.
 *
 * https://speedrun-talent-network.com publishes a public, unauthenticated REST
 * API of open roles across the speedrun + a16z portfolios. Same shape as the ATS
 * feeds we already use: no auth, no scraping, stable ids and urls.
 *
 * We take its companies, not its postings. Measured on the live API: 50 roles
 * across 17 companies, of which our filter passed 9 — thin as a jobs feed. But
 * 14 of those 17 companies weren't in the scan list at all, including Anduril,
 * Applied Intuition, ClickUp and Exa, all of which hire heavily for product and
 * AI. Sourcing depth comes from companies (their whole board, rescanned on
 * cadence), so feeding the company list into `companies` is worth far more than
 * ingesting 9 postings once — and it reuses the existing pipeline entirely.
 *
 * New rows land enabled: this is a curated, high-signal list, not a long tail
 * like the YC universe, and it's small enough not to need pacing.
 */
import { supabaseService } from "@/lib/supabase/service";
import { companySlug } from "@/lib/ats";

const API = "https://speedrun-talent-network.com/api/v1/jobs";
/** Page size the API accepts; we page until a short page ends the list. */
const PAGE = 100;
/** Stop runaway paging if the API ever stops honouring the short-page contract. */
const MAX_PAGES = 30;

interface SpeedrunJob {
  company?: string;
  company_slug?: string;
  company_url?: string;
  tier?: string | null;
}

export interface SpeedrunSyncSummary {
  jobs: number;
  companies: number;
  inserted: number; // net-new rows added to `companies`
  existing: number; // already tracked (by slug), left untouched
}

/** Every job the public API will return, paged. */
export async function fetchSpeedrunJobs(): Promise<SpeedrunJob[]> {
  const out: SpeedrunJob[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const r = await fetch(`${API}?limit=${PAGE}&offset=${p * PAGE}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) break;
    const batch = ((await r.json()) as { jobs?: SpeedrunJob[] }).jobs ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

/**
 * Pull the Speedrun company list into `companies`. Net-new only, matched by slug
 * so an existing seed/YC row (with its own ats_provider or admin enable/disable
 * state) is never clobbered. Idempotent: re-running adds only what's new.
 */
export async function syncSpeedrunCompanies(): Promise<SpeedrunSyncSummary> {
  const db = supabaseService();
  const jobs = await fetchSpeedrunJobs();

  // Dedupe by our own slug, since that's the key the ATS fetchers resolve on.
  const bySlug = new Map<string, { name: string; slug: string }>();
  for (const j of jobs) {
    const name = (j.company ?? "").trim();
    if (!name) continue;
    const slug = companySlug(name);
    if (slug) bySlug.set(slug, { name, slug });
  }
  const all = [...bySlug.values()];
  if (all.length === 0) return { jobs: jobs.length, companies: 0, inserted: 0, existing: 0 };

  const { data: have } = await db
    .from("companies")
    .select("slug")
    .in("slug", all.map((c) => c.slug));
  const known = new Set((have ?? []).map((r) => r.slug as string));
  const fresh = all.filter((c) => !known.has(c.slug));

  if (fresh.length) {
    const { error } = await db.from("companies").upsert(
      fresh.map((c) => ({
        name: c.name,
        slug: c.slug,
        ats_provider: null, // try-all, same as YC rows
        enabled: true,
        source: "speedrun",
      })),
      { onConflict: "slug", ignoreDuplicates: true },
    );
    if (error) throw new Error(`speedrun companies upsert: ${error.message}`);
  }

  return { jobs: jobs.length, companies: all.length, inserted: fresh.length, existing: all.length - fresh.length };
}

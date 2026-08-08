/**
 * Ingestion · scan (docs/admin-ingestion.md step 1). Reads the admin-managed
 * `companies` table and fetches each enabled board's open roles, filtered to the
 * roles RoleOS is about. Table-driven — adding/removing a company is a row, not
 * a deploy.
 */
import { supabaseService } from "@/lib/supabase/service";
import { fetchCompanyPostings, type AtsPosting } from "@/lib/ats";
import { isRelevantTitle } from "./relevance";

export interface Company {
  id: string;
  name: string;
  slug: string;
  ats_provider: string | null;
  yc_slug: string | null;
  barren_streak: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type IngestScope =
  | { kind: "all" }
  | { kind: "company"; companies: string[] } // by name
  | { kind: "demand" }; // companies from active intents

/**
 * Page size for reading the company list. The old code read it with a flat
 * `.limit(500)` and capped how many companies could be enabled to stay under
 * that — a silent truncation waiting to happen the moment the list grew (YC
 * alone has 1,578 companies). Paging removes the cap as the binding constraint.
 * PostgREST won't return more than 1000 rows per request regardless.
 */
const COMPANY_PAGE = 1000;

/**
 * Drain a paged read. Stops on an empty page or a short one (the last page), so
 * a caller can't spin forever on a source that keeps returning full pages by
 * mistake — a short page is the only honest end-of-list signal PostgREST gives.
 */
export async function pageAll<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number = COMPANY_PAGE,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (!page.length) break;
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

/**
 * Read every row a company query matches, a page at a time. Ordered by id so the
 * pages don't overlap or skip as rows change underneath a long sweep.
 */
function pageCompanies<T>(build: () => PostgrestPage<T>): Promise<T[]> {
  return pageAll<T>(async (from, to) => {
    const { data, error } = await build().order("id").range(from, to);
    if (error) throw new Error(`companies read: ${error.message}`);
    return data ?? [];
  });
}

/** The slice of the supabase-js builder pageCompanies needs. */
interface PostgrestPage<T> {
  order(col: string): PostgrestPage<T>;
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

/** Resolve the scope to a list of enabled companies to scan. */
export async function companiesForScope(scope: IngestScope): Promise<Company[]> {
  const db = supabaseService();
  const enabled = () =>
    db
      .from("companies")
      .select("id, name, slug, ats_provider, yc_slug, barren_streak")
      .eq("enabled", true) as unknown as PostgrestPage<Company>;

  if (scope.kind === "company") {
    const wanted = new Set(scope.companies.map((c) => c.toLowerCase().trim()));
    const all = await pageCompanies(enabled);
    return all.filter((c) => wanted.has(c.name.toLowerCase()));
  }

  if (scope.kind === "demand") {
    // Companies users are actively hunting (intents.companies), matched to the
    // enabled set by name (case-insensitive).
    const { data: intents } = await db
      .from("intents")
      .select("companies")
      .eq("status", "active")
      .limit(2000);
    const wanted = new Set(
      (intents ?? []).flatMap((r) => (r.companies as string[] | null) ?? []).map((c) => c.toLowerCase().trim()),
    );
    const all = await pageCompanies(enabled);
    return all.filter((c) => wanted.has(c.name.toLowerCase()));
  }

  return pageCompanies(enabled);
}

/** Enabled company names — the durable Workflow iterates these (one step each). */
export async function listEnabledCompanyNames(): Promise<string[]> {
  const db = supabaseService();
  const rows = await pageCompanies<{ name: string }>(
    () => db.from("companies").select("name").eq("enabled", true) as unknown as PostgrestPage<{ name: string }>,
  );
  return rows.map((c) => c.name);
}

/**
 * How long a productive company's board stays fresh before it's due again. The
 * corpus is only as current as this: a company scanned once and never revisited
 * keeps closed roles alive and misses everything posted since.
 */
export const RESCAN_INTERVAL_MS = 3 * 24 * 3_600_000;

/**
 * How far the cadence backs off for a board that keeps coming up empty, and the
 * ceiling it stops at. Measured on a 24-company sample: ~a quarter of enabled
 * companies yield zero in-scope roles on any given sweep — tiny startups, boards
 * with no product/AI openings, companies whose board doesn't resolve at all.
 * Re-fetching those every 3 days costs no Claude spend (the fetch is free and
 * dedupe runs before extract) but it lengthens the sweep and spends Workflow
 * subrequests that productive companies wait behind.
 *
 * 3d → 6d → 12d → 24d. The cap matters: a company that's quiet for a quarter can
 * still start hiring, and at 24 days we'd notice within a month. Any single hit
 * resets the streak, so the cost of being wrong is one late scan, not a lost one.
 */
const BACKOFF_CAP_STREAK = 3;

/**
 * When a company scanned now should next be looked at, given how many consecutive
 * scans have come up empty (0 = it just yielded something).
 */
export function nextScanAt(barrenStreak: number, now: number = Date.now()): string {
  const steps = Math.min(Math.max(barrenStreak, 0), BACKOFF_CAP_STREAK);
  return new Date(now + RESCAN_INTERVAL_MS * 2 ** steps).toISOString();
}

/**
 * The next batch of enabled companies due for a scan, soonest-due first, plus the
 * total still outstanding. `next_scan_at IS NULL` means never scanned under the
 * adaptive cadence — including every row at the moment migration 0021 lands, so
 * the first sweep after deploy is a full catch-up.
 *
 * The self-chaining IngestWorkflow pulls a small batch per instance (fresh
 * subrequest budget each) and spawns the next while `remaining > batch` — so a
 * 300+ company sweep can't exhaust one invocation. Each reconcile writes a new
 * `next_scan_at`, so a company drops out for the rest of the sweep and rejoins
 * when its own cadence says so.
 */
export async function listDueCompanyNames(
  limit: number,
  now: number = Date.now(),
): Promise<{ companies: string[]; remaining: number }> {
  const db = supabaseService();
  const { data, count } = await db
    .from("companies")
    .select("name", { count: "exact" })
    .eq("enabled", true)
    .or(`next_scan_at.is.null,next_scan_at.lt.${new Date(now).toISOString()}`)
    .order("next_scan_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  return { companies: (data ?? []).map((c) => c.name as string), remaining: count ?? 0 };
}

/**
 * Record a finished scan: when it happened, whether the board earned its slot,
 * and when to come back. `foundRelevant` is the count of in-scope postings, not
 * raw board size — the companies worth backing off are mostly ones that DO
 * answer with jobs, just never product/AI ones.
 *
 * A transient fetch failure reads as barren and costs one delayed cycle. That's
 * the accepted trade for not needing to tell "no board" apart from "board down":
 * the backoff is capped and any single hit resets it.
 */
export async function recordScan(
  company: Company,
  foundRelevant: number,
  now: number = Date.now(),
  opts: { dueNow?: boolean; provisional?: boolean } = {},
): Promise<void> {
  const streak = foundRelevant > 0 ? 0 : (company.barren_streak ?? 0) + 1;
  const db = supabaseService();
  await db
    .from("companies")
    .update({
      last_scanned_at: new Date(now).toISOString(),
      barren_streak: streak,
      next_scan_at: new Date(scheduleAfterScan(streak, now, opts)).toISOString(),
    })
    .eq("id", company.id);
}

/**
 * When to look at a company again, given how a scan ended.
 *
 * `provisional` is the stamp written BEFORE the insert loop. It used to write
 * the full cadence, which meant a request dying mid-loop parked the company for
 * three days with work left. Now it parks it for PROVISIONAL_RETRY_MS, so the
 * worst case of losing the final write is a short delay rather than a lost
 * cycle — the schedule is correct even if only the first write lands.
 *
 * `dueNow` is the final stamp for a company with more new roles than one request
 * can process: come straight back on the next hop.
 */
export function scheduleAfterScan(
  streak: number,
  now: number,
  opts: { dueNow?: boolean; provisional?: boolean } = {},
): number {
  if (opts.dueNow) return now;
  if (opts.provisional) return now + PROVISIONAL_RETRY_MS;
  return Date.parse(nextScanAt(streak, now));
}

/**
 * How long a company waits if a reconcile starts but never records its outcome.
 * Short enough that a lost tail-write costs one hop, long enough that a company
 * failing repeatedly can't monopolise the sweep.
 */
export const PROVISIONAL_RETRY_MS = 15 * 60_000;

/**
 * Should a company go straight back on the queue instead of waiting for its next
 * cadence? Only when it both has work left AND made progress this time —
 * progress is the termination condition. Without it, a company whose inserts
 * always fail (bad board, embed outage) would requeue itself forever and starve
 * the rest of the sweep.
 */
export function shouldRequeue(added: number, pending: number): boolean {
  return pending > 0 && added > 0;
}

/**
 * How quiet the scan log must go before a stalled sweep counts as finished. A
 * running IngestWorkflow chain stamps `last_scanned_at` continuously as it hops,
 * so recent activity means a sweep is still in flight.
 */
const SWEEP_IDLE_MS = 20 * 60_000;

/**
 * Is a durable sweep still running? The hourly cron fires far more often than a
 * full sweep takes, and a second chain would re-scan the same due companies —
 * idempotent, but pure wasted spend. Call this BEFORE any scan of your own, or
 * your own stamps will look like someone else's sweep.
 */
export async function sweepInProgress(now: number = Date.now()): Promise<boolean> {
  const db = supabaseService();
  const { data } = await db
    .from("companies")
    .select("last_scanned_at")
    .eq("enabled", true)
    .not("last_scanned_at", "is", null)
    .order("last_scanned_at", { ascending: false })
    .limit(1);
  const latest = data?.[0]?.last_scanned_at as string | undefined;
  if (!latest) return false;
  const t = Date.parse(latest);
  return Number.isFinite(t) && now - t < SWEEP_IDLE_MS;
}

/** Keywords users are hunting — widen the relevance filter to include them. */
export async function demandKeywords(): Promise<string[]> {
  const db = supabaseService();
  const { data } = await db.from("intents").select("keywords").eq("status", "active").limit(2000);
  return [...new Set((data ?? []).flatMap((r) => (r.keywords as string[] | null) ?? []))];
}

/** Fetch + filter one company's open roles. */
export async function scanCompany(c: Company, keywords: string[] = []): Promise<AtsPosting[]> {
  const posts = await fetchCompanyPostings(c.name, c.slug || undefined, c.yc_slug || undefined);
  if (posts.length === 0) return [];
  const kwRe = keywords.length ? new RegExp(keywords.map(escapeRe).join("|"), "i") : null;
  return posts.filter((p) => isRelevantTitle(p.title, kwRe));
}

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
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type IngestScope =
  | { kind: "all" }
  | { kind: "company"; companies: string[] } // by name
  | { kind: "demand" }; // companies from active intents

/** Resolve the scope to a list of enabled companies to scan. */
export async function companiesForScope(scope: IngestScope): Promise<Company[]> {
  const db = supabaseService();
  const sel = db
    .from("companies")
    .select("id, name, slug, ats_provider, yc_slug")
    .eq("enabled", true);

  if (scope.kind === "company") {
    const wanted = new Set(scope.companies.map((c) => c.toLowerCase().trim()));
    const { data } = await sel.limit(500);
    return (data ?? []).filter((c) => wanted.has(c.name.toLowerCase()));
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
    const { data } = await sel.limit(500);
    return (data ?? []).filter((c) => wanted.has(c.name.toLowerCase()));
  }

  const { data } = await sel.limit(500);
  return data ?? [];
}

/** Enabled company names — the durable Workflow iterates these (one step each). */
export async function listEnabledCompanyNames(): Promise<string[]> {
  const db = supabaseService();
  const { data } = await db.from("companies").select("name").eq("enabled", true).limit(500);
  return (data ?? []).map((c) => c.name as string);
}

/**
 * How long a company's board stays fresh before it's due for another scan. The
 * corpus is only as current as this: a company scanned once and never revisited
 * keeps closed roles alive and misses everything posted since.
 */
export const RESCAN_INTERVAL_MS = 3 * 24 * 3_600_000;

/** The timestamp before which a `last_scanned_at` counts as stale. */
export function staleCutoff(now: number = Date.now()): string {
  return new Date(now - RESCAN_INTERVAL_MS).toISOString();
}

/**
 * The next batch of enabled companies due for a scan — never scanned, or last
 * scanned more than RESCAN_INTERVAL_MS ago — plus the total still outstanding,
 * oldest first. The self-chaining IngestWorkflow pulls a small batch per
 * instance (fresh subrequest budget each) and spawns the next instance while
 * `remaining > batch` — so a 300+ company sweep can't exhaust one invocation.
 * Each reconcile stamps `last_scanned_at`, so a company drops out of this set
 * for the rest of the sweep and rejoins it once it goes stale again.
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
    .or(`last_scanned_at.is.null,last_scanned_at.lt.${staleCutoff(now)}`)
    .order("last_scanned_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  return { companies: (data ?? []).map((c) => c.name as string), remaining: count ?? 0 };
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

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
 * The next batch of enabled companies that have never been scanned, plus the
 * total still outstanding. The self-chaining IngestWorkflow pulls a small batch
 * per instance (fresh subrequest budget each) and spawns the next instance while
 * `remaining > batch` — so a 300+ company sweep can't exhaust one invocation.
 */
export async function listUnscannedCompanyNames(
  limit: number,
): Promise<{ companies: string[]; remaining: number }> {
  const db = supabaseService();
  const { data, count } = await db
    .from("companies")
    .select("name", { count: "exact" })
    .eq("enabled", true)
    .is("last_scanned_at", null)
    .order("name")
    .limit(limit);
  return { companies: (data ?? []).map((c) => c.name as string), remaining: count ?? 0 };
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

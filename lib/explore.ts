/**
 * Explore · data layer (docs/explore-index.md). Server-only reads of the public
 * Index for the anon /index pages. Uses the service role (roles RLS stays
 * authenticated-only; the pages render server-side and are public). Curated seed
 * roles are surfaced before thinner ingested `ats` roles everywhere.
 *
 * NEVER import into a client component — service-role only.
 */
import { headers } from "next/headers";
import { supabaseService } from "@/lib/supabase/service";

/**
 * Touch a request-scoped API so Next renders the Explore pages DYNAMICALLY (per
 * request = real-time), not as a build-time static snapshot. Without this, the
 * service-role pages read no request data, so OpenNext tries to prerender them —
 * which both serves stale data and 500s the overview. Call at the top of every
 * data fetch.
 */
async function dynamicReadGuard(): Promise<void> {
  await headers();
}

/** Deterministic, SEO-friendly slug from a company name. "Scale AI" → "scale-ai". */
export function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface CompanyRow {
  company: string;
  slug: string;
  count: number;
  curated: number; // seed (rich)
  hunted: number; // ats (thin)
}

export interface RoleLite {
  id: string;
  company: string;
  role_title: string;
  url: string | null;
  archetype: string | null;
  source: string | null; // 'seed' | 'ats'
  location: { name?: string; type?: string } | null;
  seniority: { level?: string } | null;
  mustHavesCount: number;
}

export interface ArchetypeRow {
  name: string;
  slug: string;
  count: number;
  pct: number;
}

const isThin = (source: string | null | undefined) => source === "ats";
const mustCount = (r: { must_haves?: unknown }) => (Array.isArray(r.must_haves) ? r.must_haves.length : 0);

/** Curated (seed) first, then by extraction completeness, then title. */
function curatedFirst(rows: Array<Record<string, unknown>>): RoleLite[] {
  return rows
    .map((r) => ({
      id: r.id as string,
      company: (r.company as string) ?? "Unknown",
      role_title: (r.role_title as string) ?? "Untitled",
      url: (r.url as string) ?? null,
      archetype: (r.archetype as string) ?? null,
      source: (r.source as string) ?? null,
      location: (r.location as RoleLite["location"]) ?? null,
      seniority: (r.seniority as RoleLite["seniority"]) ?? null,
      mustHavesCount: mustCount(r),
    }))
    .sort(
      (a, b) =>
        Number(isThin(a.source)) - Number(isThin(b.source)) ||
        b.mustHavesCount - a.mustHavesCount ||
        a.role_title.localeCompare(b.role_title),
    );
}

interface RpcStats {
  totalRoles?: number;
  totalCompanies?: number;
  allCompanies?: Array<{ slug: string; name: string; count: number }>;
  archetypes?: Array<{ name: string; count: number; pct: number }>;
}

/**
 * One server-side aggregation (public_index_stats RPC) instead of fetching the
 * whole roles table and aggregating in the Worker — scalable as the corpus grows
 * (and the all-roles JS aggregation was tripping the Worker resource limit on the
 * overview, which runs two of them).
 */
async function rpcStats(): Promise<RpcStats> {
  await dynamicReadGuard();
  const db = supabaseService();
  const { data } = await db.rpc("public_index_stats");
  return (data as RpcStats) ?? {};
}

/** All companies that have at least one role, biggest first. */
export async function listCompanies(): Promise<CompanyRow[]> {
  const all = (await rpcStats()).allCompanies ?? [];
  return all.map((c) => ({ company: c.name, slug: c.slug, count: c.count, curated: 0, hunted: 0 }));
}

/** All role types (archetypes) with counts + share. */
export async function listArchetypes(): Promise<ArchetypeRow[]> {
  const arch = (await rpcStats()).archetypes ?? [];
  return arch.map((a) => ({ name: a.name, slug: toSlug(a.name), count: a.count, pct: a.pct }));
}

/** Everything the overview needs in ONE RPC call. */
export async function indexStats(): Promise<{ totalRoles: number; companies: CompanyRow[]; archetypes: ArchetypeRow[] }> {
  const s = await rpcStats();
  return {
    totalRoles: s.totalRoles ?? 0,
    companies: (s.allCompanies ?? []).map((c) => ({ company: c.name, slug: c.slug, count: c.count, curated: 0, hunted: 0 })),
    archetypes: (s.archetypes ?? []).map((a) => ({ name: a.name, slug: toSlug(a.name), count: a.count, pct: a.pct })),
  };
}

/** Resolve a company slug back to its exact name (small set; exact match). */
export async function companyBySlug(slug: string): Promise<string | null> {
  return (await listCompanies()).find((c) => c.slug === slug)?.company ?? null;
}

export async function archetypeBySlug(slug: string): Promise<string | null> {
  return (await listArchetypes()).find((a) => a.slug === slug)?.name ?? null;
}

const ROLE_COLS = "id, company, role_title, url, archetype, source, location, seniority, must_haves";

export async function companyRoles(company: string): Promise<RoleLite[]> {
  const db = supabaseService();
  const { data } = await db.from("roles").select(ROLE_COLS).eq("company", company).limit(1000);
  return curatedFirst((data as Array<Record<string, unknown>>) ?? []);
}

export async function archetypeRoles(archetype: string): Promise<RoleLite[]> {
  const db = supabaseService();
  const { data } = await db.from("roles").select(ROLE_COLS).eq("archetype", archetype).limit(2000);
  return curatedFirst((data as Array<Record<string, unknown>>) ?? []);
}

export interface PostingDetail {
  id: string;
  company: string;
  companySlug: string;
  role_title: string;
  url: string | null;
  archetype: string | null;
  source: string | null;
  location: { name?: string; type?: string } | null;
  seniority: { level?: string; years_required_min?: number } | null;
  mustHaves: string[];
  niceToHaves: string[];
  description: string | null;
}

/** must_haves (seed = objects, ats = strings) → a flat string[] for Q&A context. */
export function mhText(must_haves: unknown): string[] {
  return Array.isArray(must_haves) ? (must_haves as unknown[]).map(toText) : [];
}

/** Normalise a must_have/nice_to_have entry (seed = obj, ats = string) to text. */
function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return String(o.raw_text_from_jd ?? o.text ?? o.requirement ?? JSON.stringify(o));
  }
  return String(v);
}

export async function posting(id: string): Promise<PostingDetail | null> {
  await dynamicReadGuard();
  const db = supabaseService();
  const { data } = await db
    .from("roles")
    .select("id, company, role_title, url, archetype, source, location, seniority, must_haves, nice_to_haves, description")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    company: (r.company as string) ?? "Unknown",
    companySlug: toSlug((r.company as string) ?? ""),
    role_title: (r.role_title as string) ?? "Untitled",
    url: (r.url as string) ?? null,
    archetype: (r.archetype as string) ?? null,
    source: (r.source as string) ?? null,
    location: (r.location as PostingDetail["location"]) ?? null,
    seniority: (r.seniority as PostingDetail["seniority"]) ?? null,
    mustHaves: Array.isArray(r.must_haves) ? (r.must_haves as unknown[]).map(toText) : [],
    niceToHaves: Array.isArray(r.nice_to_haves) ? (r.nice_to_haves as unknown[]).map(toText) : [],
    description: (r.description as string) ?? null,
  };
}


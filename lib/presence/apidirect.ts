/**
 * API Direct provider for Presence sourcing. Port of
 * nik-jain-jobos/social/signals/providers/apidirect.mjs.
 *
 * Docs: https://apidirect.io/docs   Auth: header X-API-Key.
 * Pricing: $0.006 per request, 20 posts per page. Only 2xx responses are
 * billed, so retries are free.
 *
 * Three constraints are UNDOCUMENTED and were all found on the first live run,
 * 2026-08-11 (eleven requests, $0.07):
 *   - `author` takes at most 5 comma-separated values (docs imply unlimited)
 *   - `author_company` takes numeric LinkedIn company IDs only, never names
 *   - `author_title` requires a `query` alongside it
 * They are enforced here so a bad source fails at insert time with a readable
 * message instead of failing the nightly run.
 */

import type { PresenceItem } from "@/lib/presence/rank";

const BASE = "https://apidirect.io/v1";

export const COST_PER_REQUEST = 0.006;
export const MAX_AUTHORS_PER_REQUEST = 5;

const RESOURCE: Record<string, { path: string; key: string }> = {
  linkedin: { path: "linkedin/posts", key: "posts" },
  twitter: { path: "twitter/posts", key: "posts" },
  reddit: { path: "reddit/posts", key: "posts" },
};

export interface SourceDef {
  id: string | null; // presence_sources.id (null for ad-hoc validation)
  slug: string;
  platform: string;
  type: string;
  value: string;
  query?: string | null;
}

/**
 * Map a source onto API Direct query parameters. `value` may be a
 * comma-separated author batch, which is what makes watching 60 people cost 12
 * requests instead of 60. Throws with a human-readable message on the
 * undocumented constraints above; the sources API reuses this as validation.
 */
export function paramsForSource({ type, value, platform, query }: SourceDef): Record<string, string> {
  const v = String(value).slice(0, 500);
  if (platform !== "linkedin") return { query: v }; // X and Reddit take keywords only
  switch (type) {
    case "keyword":
      return { query: v };
    case "author": {
      const n = v.split(",").filter(Boolean).length;
      if (n > MAX_AUTHORS_PER_REQUEST) {
        throw new Error(`author source has ${n} values; max is ${MAX_AUTHORS_PER_REQUEST}. Split into more sources.`);
      }
      return { author: v };
    }
    case "company":
      if (!/^\d+(,\d+)*$/.test(v)) {
        throw new Error(`company source needs numeric LinkedIn company IDs, got "${v}"`);
      }
      return { author_company: v };
    case "title":
      if (!query) throw new Error("title source requires a `query` field alongside `value`");
      return { author_title: v, query: String(query).slice(0, 500) };
    case "industry":
      if (!/^\d+(,\d+)*$/.test(v)) {
        throw new Error(`industry source needs numeric LinkedIn industry IDs, got "${v}"`);
      }
      return { author_industry: v, ...(query ? { query: String(query).slice(0, 500) } : {}) };
    case "mentions":
      return { mentions_company: v };
    default:
      throw new Error(`unknown source type: ${type}`);
  }
}

/**
 * Fetch one page for one source. Returns normalized items. `sort_by` accepts
 * most_recent | relevance; most_recent is sent explicitly (FounderFirst's
 * "recent" is not a documented value and silently falls back to the default).
 */
export async function fetchSource(
  source: SourceDef,
  apiKey: string,
  { page = 1, sortBy = "most_recent" }: { page?: number; sortBy?: string } = {},
): Promise<PresenceItem[]> {
  if (!apiKey) throw new Error("API_DIRECT_KEY not set");
  const r = RESOURCE[source.platform];
  if (!r) throw new Error(`unsupported platform: ${source.platform}`);

  const u = new URL(`${BASE}/${r.path}`);
  for (const [k, val] of Object.entries(paramsForSource(source))) u.searchParams.set(k, val);
  u.searchParams.set("page", String(page));
  u.searchParams.set("sort_by", sortBy);

  const res = await fetch(u, { headers: { "X-API-Key": apiKey } });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`apidirect ${source.platform} ${res.status}: ${body}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const items = Array.isArray(data[r.key]) ? (data[r.key] as unknown[])
    : Array.isArray(data.posts) ? (data.posts as unknown[])
    : Array.isArray(data.results) ? (data.results as unknown[])
    : [];
  return items.map((p) => normalize(source, p as Record<string, unknown>));
}

/**
 * Engagement is not a documented field and its key varies by platform, so
 * probe the likely names rather than assuming one. Returns null when absent;
 * the reaction-window filter treats null as "unknown, do not exclude".
 */
function engagementOf(p: Record<string, unknown>): number | null {
  const keys = [
    "reactions", "reaction_count", "num_reactions", "likes", "like_count",
    "num_likes", "favorite_count", "engagement", "total_reactions",
  ];
  for (const k of keys) {
    const v = p?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  }
  return null;
}

function normalize(source: SourceDef, p: Record<string, unknown>): PresenceItem {
  let posted_at: string | null = null;
  const raw_date = p.date || p.posted_at || p.created_at || p.time;
  if (raw_date) {
    const d = new Date(String(raw_date));
    if (!isNaN(d.getTime())) posted_at = d.toISOString();
  }
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    platform: source.platform,
    source_id: source.id,
    url: str(p.url),
    author: str(p.author) ?? str(p.author_name),
    author_headline: str(p.author_headline) ?? str(p.author_title),
    title: str(p.title),
    body: str(p.snippet) ?? str(p.body) ?? str(p.text) ?? str(p.description),
    posted_at,
    engagement: engagementOf(p),
    raw: p,
  };
}

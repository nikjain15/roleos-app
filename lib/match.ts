import { embeddings } from "@/lib/embeddings";
import { supabaseService } from "@/lib/supabase/service";

/**
 * Hybrid matching, server-side (architecture.md §4.3):
 *   1. embed the user's background (Workers AI bge — same vector space as corpus)
 *   2. pgvector recall via the match_roles RPC (nearest N of the 557)
 *   3. fetch those roles
 * The Claude reasoning/precision layer (the `match` skill) runs on top — see
 * lib/run-match.ts, kept separate so the recall step is independently testable.
 *
 * Uses the service-role client: onboarding runs pre-signup (anon), and role data
 * is global/public. Nothing user-owned is touched here.
 */
export interface CandidateRole {
  id: string;
  company: string;
  role_title: string;
  archetype: string | null;
  must_haves: unknown;
  nice_to_haves: unknown;
  comp: unknown;
  url: string | null;
  distance: number;
}

type Hit = { role_id: string; distance: number };

/**
 * Merge nearest-neighbour hit lists from several queries into one ranked list,
 * keeping each role's BEST (smallest) distance across the queries. Pure — the
 * union step of multi-query recall, unit-tested in isolation. Nearest first.
 */
export function mergeHits(lists: Hit[][]): Hit[] {
  const best = new Map<string, number>();
  for (const list of lists) {
    for (const h of list) {
      const prev = best.get(h.role_id);
      if (prev === undefined || h.distance < prev) best.set(h.role_id, h.distance);
    }
  }
  return [...best.entries()]
    .map(([role_id, distance]) => ({ role_id, distance }))
    .sort((a, b) => a.distance - b.distance);
}

/** Fetch full CandidateRole rows for a ranked id list, preserving order. */
async function hydrateRoles(
  db: ReturnType<typeof supabaseService>,
  ranked: Hit[],
): Promise<CandidateRole[]> {
  const ids = ranked.map((h) => h.role_id);
  if (ids.length === 0) return [];
  const distById = new Map(ranked.map((h) => [h.role_id, h.distance]));
  const { data: roles, error } = await db
    .from("roles")
    .select("id, company, role_title, archetype, must_haves, nice_to_haves, comp, url")
    .in("id", ids);
  if (error) throw new Error(`roles fetch: ${error.message}`);
  // preserve nearest-first order from the ranked list
  return ids
    .map((id) => {
      const r = roles!.find((x) => x.id === id);
      return r ? ({ ...r, distance: distById.get(id)! } as CandidateRole) : null;
    })
    .filter((r): r is CandidateRole => r !== null);
}

export async function recallRoles(profileText: string, count = 6): Promise<CandidateRole[]> {
  const [embedding] = await embeddings().embed([profileText.slice(0, 4000)]);

  const db = supabaseService();
  const { data: hits, error } = await db.rpc("match_roles", {
    query_embedding: embedding,
    match_count: count,
  });
  if (error) throw new Error(`match_roles: ${error.message}`);

  return hydrateRoles(db, hits as Hit[]);
}

export interface MultiRecallResult {
  candidates: CandidateRole[];
  /** Total roles reachable by recall (embedded corpus size) — for honest "scanned" copy. */
  poolSize: number;
}

/**
 * Multi-query recall (the domain-bias fix). Embeds SEVERAL queries — the raw
 * profile plus function-forward search facets (agent/skills/search_facets) —
 * runs pgvector recall for each, and UNIONS the neighbours keeping each role's
 * best distance. One domain-anchored vector can't crowd out function matches:
 * a role that's the nearest neighbour of ANY facet enters the pool. The wide,
 * diverse pool is then reranked by the matcher (see lib/run-match).
 */
export async function recallRolesMulti(
  queries: string[],
  total = 36,
  perQuery = 18,
): Promise<MultiRecallResult> {
  const clean = queries.map((q) => q.slice(0, 4000)).filter((q) => q.trim().length > 0);
  if (clean.length === 0) return { candidates: [], poolSize: 0 };

  const db = supabaseService();
  const vectors = await embeddings().embed(clean);

  const hitLists = await Promise.all(
    vectors.map(async (vec) => {
      const { data, error } = await db.rpc("match_roles", {
        query_embedding: vec,
        match_count: perQuery,
      });
      if (error) throw new Error(`match_roles: ${error.message}`);
      return data as Hit[];
    }),
  );

  const merged = mergeHits(hitLists).slice(0, total);
  const candidates = await hydrateRoles(db, merged);

  const { count } = await db
    .from("role_embeddings")
    .select("role_id", { count: "exact", head: true });

  return { candidates, poolSize: count ?? candidates.length };
}

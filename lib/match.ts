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

export async function recallRoles(profileText: string, count = 6): Promise<CandidateRole[]> {
  const [embedding] = await embeddings().embed([profileText.slice(0, 4000)]);

  const db = supabaseService();
  const { data: hits, error } = await db.rpc("match_roles", {
    query_embedding: embedding,
    match_count: count,
  });
  if (error) throw new Error(`match_roles: ${error.message}`);

  const ids = (hits as Array<{ role_id: string; distance: number }>).map((h) => h.role_id);
  const distById = new Map(
    (hits as Array<{ role_id: string; distance: number }>).map((h) => [h.role_id, h.distance]),
  );

  const { data: roles, error: rErr } = await db
    .from("roles")
    .select("id, company, role_title, archetype, must_haves, nice_to_haves, comp, url")
    .in("id", ids);
  if (rErr) throw new Error(`roles fetch: ${rErr.message}`);

  // preserve nearest-first order from the RPC
  return ids
    .map((id) => {
      const r = roles!.find((x) => x.id === id);
      return r ? ({ ...r, distance: distById.get(id)! } as CandidateRole) : null;
    })
    .filter((r): r is CandidateRole => r !== null);
}

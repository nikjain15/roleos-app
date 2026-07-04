import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { embeddings } from "@/lib/embeddings";

/**
 * Fit-on-browse (roles-workspace P0-7, slice W1). For a signed-in user browsing
 * the public Index, overlay a per-role fit indicator:
 *
 *   • roles the matcher already reasoned about → the REAL stored fit + verdict
 *     (read RLS-scoped from `matches`; no new model call — same rule as P0-5);
 *   • every other role → an honest embedding-similarity ESTIMATE, tiered
 *     against the user's OWN corpus-distance distribution (cosine distance is
 *     only meaningful relative to the user: a senior AI PM sits ~0.29 median
 *     from this corpus, a non-tech profile ~0.41 — absolute cutoffs would call
 *     everything "strong" for one and "weak" for the other).
 *
 * Zero model calls on the browse path. The profile embedding + the user's
 * p10/p35 distance anchors are cached in `profile_embeddings` (service-role
 * writes only) and refreshed only when the profile text changes (hash check).
 * Anon visitors and any failure path return null → the index renders unchanged.
 *
 * Server-only (imports the service client) — NEVER import into a client component.
 */

export type EstimateTier = "strong" | "look" | "weak";

export type RoleFit =
  | { kind: "scored"; fit: number | null; verdict: "pursue" | "maybe" | "skip" }
  | { kind: "estimated"; tier: EstimateTier };

export interface ExploreFit {
  /** role_id → indicator for every role we could score or estimate. */
  byRole: Map<string, RoleFit>;
  /** True when the viewer is signed in but has no usable profile yet. */
  needsProfile: boolean;
}

/** Anchors: the viewer's own 10th/35th-percentile corpus distances. */
export interface DistanceAnchors {
  d10: number;
  d35: number;
}

/**
 * Pure tier mapping — nearest decile of the user's own distribution reads as a
 * strong signal, the next band is worth a look, the long tail is honestly weak.
 */
export function tierForDistance(distance: number, anchors: DistanceAnchors): EstimateTier {
  if (distance <= anchors.d10) return "strong";
  if (distance <= anchors.d35) return "look";
  return "weak";
}

/** Normalise a stored `matches.recommendation` to a verdict (mirrors lib/workspace). */
export function toScoredVerdict(rec: string | null): "pursue" | "maybe" | "skip" {
  const r = (rec ?? "").toLowerCase();
  if (r.includes("pursue") || r.includes("strong")) return "pursue";
  if (r.includes("skip") || r.includes("pass") || r.includes("no")) return "skip";
  return "maybe";
}

const MIN_PROFILE_CHARS = 30;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type CachedEmbedding = {
  embedding: number[];
  anchors: DistanceAnchors;
};

/**
 * Read the cached profile embedding; (re)build it when missing or stale.
 * Returns null when the user has no usable profile text.
 */
async function profileEmbedding(userId: string, profileRaw: string): Promise<CachedEmbedding | null> {
  const text = profileRaw.trim();
  if (text.length < MIN_PROFILE_CHARS) return null;
  const hash = await sha256(text);

  const service = supabaseService();
  const { data: cached } = await service
    .from("profile_embeddings")
    .select("embedding, profile_hash, d10, d35")
    .eq("user_id", userId)
    .maybeSingle();

  if (cached && cached.profile_hash === hash && cached.d10 !== null && cached.d35 !== null) {
    const vec = typeof cached.embedding === "string" ? (JSON.parse(cached.embedding) as number[]) : (cached.embedding as number[]);
    return { embedding: vec, anchors: { d10: cached.d10 as number, d35: cached.d35 as number } };
  }

  // Stale or missing → one embed call + one bounded corpus scan, then cache.
  const provider = embeddings();
  const [vec] = await provider.embed([text.slice(0, 4000)]);
  const { data: q, error: qErr } = await service.rpc("profile_distance_quantiles", {
    query_embedding: vec,
  });
  if (qErr) throw new Error(`profile_distance_quantiles: ${qErr.message}`);
  const row = (Array.isArray(q) ? q[0] : q) as { d10: number | null; d35: number | null } | undefined;
  if (!row || row.d10 === null || row.d35 === null) return null; // empty corpus — nothing to estimate against

  const anchors = { d10: row.d10, d35: row.d35 };
  const { error: upErr } = await service.from("profile_embeddings").upsert(
    {
      user_id: userId,
      embedding: vec,
      model: provider.model,
      profile_hash: hash,
      d10: anchors.d10,
      d35: anchors.d35,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upErr) throw new Error(`profile_embeddings upsert: ${upErr.message}`);
  return { embedding: vec, anchors };
}

/**
 * The one entry point the Explore pages call. Anon → null (index unchanged —
 * the P0-7 acceptance criterion). Signed-in without a profile →
 * `{ needsProfile: true }` so the page can offer the way forward once.
 * Any internal failure degrades to null — browsing must never break.
 */
export async function exploreFitForRoles(roleIds: string[]): Promise<ExploreFit | null> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const byRole = new Map<string, RoleFit>();
    if (roleIds.length === 0) return { byRole, needsProfile: false };

    // 1 · Real scored matches. Fetch ALL the viewer's matches (RLS-scoped, a
    // small bounded set) and filter in memory — an `.in(roleIds)` filter would
    // put up to 2000 uuids in the GET query string (414s on big archetype pages).
    const wanted = new Set(roleIds);
    const { data: matches } = await supabase
      .from("matches")
      .select("role_id, fit_score, recommendation")
      .limit(500);
    for (const m of (matches ?? []).filter((m) => wanted.has(m.role_id as string))) {
      byRole.set(m.role_id as string, {
        kind: "scored",
        fit: m.fit_score === null ? null : Math.round(Number(m.fit_score)),
        verdict: toScoredVerdict(m.recommendation as string | null),
      });
    }

    // 2 · Estimate the rest from the cached profile embedding.
    const { data: mp } = await supabase.from("master_profile").select("data").eq("user_id", user.id).maybeSingle();
    const raw = (mp?.data as { raw?: string } | null)?.raw ?? "";
    if (raw.trim().length < MIN_PROFILE_CHARS) {
      return { byRole, needsProfile: byRole.size === 0 };
    }

    const cached = await profileEmbedding(user.id, raw);
    if (!cached) return { byRole, needsProfile: byRole.size === 0 };

    const remaining = roleIds.filter((id) => !byRole.has(id));
    if (remaining.length > 0) {
      const { data: dists, error } = await supabaseService().rpc("role_distances", {
        query_embedding: cached.embedding,
        role_ids: remaining,
      });
      if (error) throw new Error(`role_distances: ${error.message}`);
      for (const d of (dists ?? []) as Array<{ role_id: string; distance: number }>) {
        byRole.set(d.role_id, { kind: "estimated", tier: tierForDistance(d.distance, cached.anchors) });
      }
    }
    return { byRole, needsProfile: false };
  } catch {
    // Fit is an overlay — a failure must never take the public index down.
    return null;
  }
}

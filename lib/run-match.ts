import { recallRolesMulti, type CandidateRole } from "@/lib/match";
import { runSkill } from "@/agent/skills/run";
import matchSkill from "@/agent/skills/match";
import matchRankSkill from "@/agent/skills/match_rank";
import searchFacetsSkill from "@/agent/skills/search_facets";
import { parseModelJson } from "@/lib/json";

/**
 * Full matching: query-expanded pgvector recall → coarse rerank → Claude
 * reasoning (the `match` skill, through the quality gate) → merged result the
 * feed/onboarding render. RO's recommendation + why + gaps per role, calibrated
 * to the confidence ladder.
 *
 * WHY THREE STAGES (the domain-bias fix):
 *  1. search_facets (Haiku) turns the profile into function-forward queries so
 *     recall isn't trapped in the candidate's current-industry vocabulary.
 *  2. recallRolesMulti unions the neighbours of every query → a WIDE, diverse
 *     pool (a strong functional match in another domain still gets in).
 *  3. match_rank (Sonnet) scores the whole pool cheaply; only the genuine top
 *     go to the expensive `match` reasoner (which is token-bounded and can't
 *     write full reasoning for 36 roles).
 * Single-query, recall-truncated matching surfaced same-domain roles only and
 * starved better-fit, different-domain roles — that's the bug this replaces.
 */
export interface MatchedRole extends CandidateRole {
  fit: number;
  recommendation: "pursue" | "maybe" | "skip";
  why: string;
  gaps: Array<{ gap: string; bridgeable: "yes" | "maybe" | "no" }>;
}

// Recall WIDE, reason on the genuine top. Tuned to the matcher's token budget:
// the rich `match` pass writes why+gaps for SHORTLIST roles, which must fit in
// its 4096-token output budget.
const RECALL_TOTAL = 36; // candidates unioned across all query facets
const RECALL_PER_QUERY = 18; // neighbours pulled per facet before union
const SHORTLIST = 10; // roles sent to the rich reasoner

/** Build the recall queries: the raw profile (anchor) + function-forward facets. */
async function buildQueries(profileText: string): Promise<string[]> {
  const queries = [profileText];
  try {
    const res = await runSkill(searchFacetsSkill, { userId: "anon", data: { profile: profileText } });
    const facets = parseModelJson<string[]>(res.verdict.finalOutput);
    if (Array.isArray(facets)) {
      for (const f of facets) if (typeof f === "string" && f.trim()) queries.push(f.trim());
    }
  } catch {
    /* facet expansion is an enhancement — fall back to profile-only recall */
  }
  // de-dupe, cap (one embed call per query) — keep the profile anchor first
  return [...new Set(queries)].slice(0, 7);
}

/** Coarse-rank the wide pool and return the shortlist worth deep reasoning. */
async function shortlist(profileText: string, candidates: CandidateRole[]): Promise<CandidateRole[]> {
  if (candidates.length <= SHORTLIST) return candidates;
  try {
    const stubs = candidates.map((c) => ({
      id: c.id,
      company: c.company,
      role_title: c.role_title,
      archetype: c.archetype,
      must_haves: c.must_haves,
    }));
    const res = await runSkill(matchRankSkill, {
      userId: "anon",
      data: { profile: profileText, roles: stubs },
    });
    const scored = parseModelJson<Array<{ id: string; fit: number; keep?: boolean }>>(
      res.verdict.finalOutput,
    );
    if (Array.isArray(scored) && scored.length) {
      const fitById = new Map(scored.map((s) => [s.id, typeof s.fit === "number" ? s.fit : 0]));
      return [...candidates]
        .sort((a, b) => (fitById.get(b.id) ?? 0) - (fitById.get(a.id) ?? 0))
        .slice(0, SHORTLIST);
    }
  } catch {
    /* coarse rank is an optimisation — fall back to recall order */
  }
  return candidates.slice(0, SHORTLIST);
}

export async function matchProfile(
  profileText: string,
  count = 8,
): Promise<{ matches: MatchedRole[]; scanned: number; gatePassed: boolean }> {
  const queries = await buildQueries(profileText);
  const { candidates, poolSize } = await recallRolesMulti(queries, RECALL_TOTAL, RECALL_PER_QUERY);
  if (candidates.length === 0) return { matches: [], scanned: poolSize, gatePassed: true };

  const short = await shortlist(profileText, candidates);

  const { verdict } = await runSkill(matchSkill, {
    userId: "anon",
    data: { profile: profileText, roles: short },
  });

  const reasoned = parseModelJson<Array<Record<string, unknown>>>(verdict.finalOutput) ?? [];
  const byId = new Map(reasoned.map((m) => [m.id, m]));

  const matches: MatchedRole[] = short.map((c) => {
    const m = byId.get(c.id) ?? {};
    return {
      ...c,
      fit: typeof m.fit === "number" ? m.fit : Math.round((1 - c.distance) * 100),
      recommendation: (m.recommendation as MatchedRole["recommendation"]) ?? "maybe",
      why: (m.why as string) ?? "",
      gaps: (m.gaps as MatchedRole["gaps"]) ?? [],
    };
  });

  // sort by RO's fit, pursue first; return the best `count` for the feed
  matches.sort((a, b) => b.fit - a.fit);
  return {
    matches: matches.slice(0, Math.max(count, 1)),
    scanned: poolSize,
    gatePassed: verdict.status === "passed",
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { runSkill } from "@/agent/skills/run";
import tasteRerankSkill from "@/agent/skills/taste_rerank";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import type { MatchedRole } from "@/lib/run-match";

/**
 * The taste overlay (docs/specs/profile-data-layer.md, Layer 3). Closes the loop:
 * the learned taste_model — which was projected but NEVER fed matching — now
 * reorders suggestions, transparently. Decision 1 = A: reorder-with-reasons,
 * nothing hidden or filtered.
 */

// Only reasonably-confident taste should move rankings.
const MIN_CONFIDENCE = 0.55;
const DELTA_CAP = 12;

type TasteDelta = { delta: number; reason: string };

/**
 * PURE: apply per-role deltas to matched roles — clamp the delta, adjust fit into
 * [0,100], attach the labeled reason, and re-sort by the adjusted fit (pursue
 * first via fit). Deterministic; no I/O. Exported for testing + reuse.
 */
export function applyTasteDeltas(matches: MatchedRole[], deltas: Map<string, TasteDelta>): MatchedRole[] {
  const adjusted = matches.map((m) => {
    const d = deltas.get(m.id);
    if (!d || !Number.isFinite(d.delta) || d.delta === 0) return m;
    const delta = Math.max(-DELTA_CAP, Math.min(DELTA_CAP, Math.round(d.delta)));
    if (delta === 0) return m;
    const fit = Math.max(0, Math.min(100, m.fit + delta));
    return { ...m, fit, taste: { delta, reason: d.reason?.trim() || "reflects your stated preferences" } };
  });
  return adjusted.sort((a, b) => b.fit - a.fit);
}

/** The high-confidence taste phrases worth ranking on, most-confident first. */
async function highConfidenceTaste(db: SupabaseClient): Promise<string[]> {
  const { data } = await db
    .from("taste_model")
    .select("attribute, value, confidence, user_confirmed")
    .order("confidence", { ascending: false })
    .limit(12);
  return (data ?? [])
    .filter((t) => t.user_confirmed || (typeof t.confidence === "number" && t.confidence >= MIN_CONFIDENCE))
    .map((t) => {
      const v = t.value as { phrase?: string; note?: string } | null;
      return (v?.phrase ?? t.attribute) as string;
    })
    .filter((s): s is string => !!s && s.trim().length > 0);
}

/**
 * Read the user's taste, and if there's anything confident to act on, run the
 * overlay skill and re-rank. Best-effort: no taste, or any failure → the matches
 * come back untouched (never worse than base matching).
 */
export async function tasteRerank(
  db: SupabaseClient,
  userId: string,
  matches: MatchedRole[],
): Promise<MatchedRole[]> {
  if (matches.length === 0) return matches;
  const taste = await highConfidenceTaste(db);
  if (taste.length === 0) return matches;

  try {
    const roles = matches.map((m) => ({ id: m.id, title: m.role_title, company: m.company, why: m.why }));
    const { verdict, routing } = await runSkill(tasteRerankSkill, { userId, data: { taste, roles } });
    await logAgentRuns(userId, verdict.runs, { skill: "taste_rerank", judge: verdict, routing });
    const out = parseModelJson<Array<{ id?: string; delta?: number; reason?: string }>>(verdict.finalOutput);
    if (!Array.isArray(out)) return matches;
    const deltas = new Map<string, TasteDelta>();
    for (const r of out) {
      if (typeof r.id === "string" && typeof r.delta === "number") {
        deltas.set(r.id, { delta: r.delta, reason: typeof r.reason === "string" ? r.reason : "" });
      }
    }
    return applyTasteDeltas(matches, deltas);
  } catch {
    return matches; // overlay is best-effort — base ranking still stands
  }
}

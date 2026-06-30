import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Coarse reranker — stage 1 of two-stage matching (lib/run-match).
 *
 * Recall now returns a WIDE, diverse candidate pool (query-expanded + unioned),
 * deliberately more roles than the matcher can write full reasoning for inside
 * its token budget. This pass scores the whole pool quickly (score only, no prose)
 * so the expensive `match` skill reasons only over the genuine top — and so a
 * strong FUNCTION match that the embedding ranked low still gets surfaced.
 *
 * Sonnet tier: a coarse fit/keep call over compact role stubs, not RO's
 * user-facing reasoning (that's the `match` skill, on the shortlist this picks).
 */
export default skill({
  id: "match_rank",
  model: "draft", // Sonnet — fast, capable coarse ranker over a wide set
  tools: [],
  gate: "shape_only", // internal ranking; the rich `match` pass is voice-judged
  structured: true,
  prompt: ({ data }) => {
    const roles = data.roles as Array<Record<string, unknown>>;
    const profile = data.profile as string;
    return {
      system: [
        "You triage how well a candidate fits each role in a shortlist, for THEIR job hunt.",
        "Judge on ROLE FUNCTION and SENIORITY first, then domain — a strong functional match in a",
        "different industry can beat a weak same-industry one. Be decisive; it's fine to score many low.",
        "Return STRICT JSON only: an array, one object per input role, SAME order, each:",
        '{"id": string (echo the role id), "fit": 0-100 integer, "keep": boolean}.',
        "Set keep=true for the roles genuinely worth deep reasoning; keep=false for clear non-fits.",
        "No prose, no reasoning text — scores only.",
      ].join(" "),
      user: `SHORTLIST:\n${JSON.stringify(roles)}\n\nCANDIDATE BACKGROUND:\n${profile}\n\nScore each. JSON array only.`,
    };
  },
  expects: (text) => {
    const o = parseModelJson<Array<{ id?: unknown; fit?: unknown }>>(text);
    return Array.isArray(o) && o.every((m) => typeof m.fit === "number" && typeof m.id === "string");
  },
});

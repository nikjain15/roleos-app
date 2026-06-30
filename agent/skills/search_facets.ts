import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Query expansion for role recall (the fix for domain-anchored retrieval).
 *
 * THE PROBLEM this solves: a single embedding of the raw profile is dominated by
 * the candidate's DOMAIN vocabulary (e.g. "finance / banking / payments"), so
 * pgvector pulls same-domain roles and starves same-FUNCTION roles in a different
 * domain (e.g. an AI/ML product leader gets only fintech PM roles, never the
 * Conversational-AI / AI-platform roles they'd actually want). With recall
 * truncated to the nearest few, those function matches never reach the reasoner.
 *
 * THE FIX: from one profile, emit several short, role-shaped SEARCH QUERIES that
 * each capture a distinct, credible direction — weighted toward FUNCTION + LEVEL
 * over current industry. lib/match.recallRolesMulti embeds each, unions the
 * nearest neighbours, and hands a diverse pool to the matcher. Cheap Haiku tier.
 */
export default skill({
  id: "search_facets",
  model: "quick_tag", // Haiku — cheap + fast; this is retrieval plumbing, not voice
  tools: [],
  gate: "shape_only", // internal transformation, not RO's companion voice
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You turn a candidate's background into SEARCH QUERIES that retrieve well-matched job roles.",
      "Output 4-6 short, role-shaped queries (each a title-like phrase, e.g. 'Senior AI/ML product manager,",
      "conversational AI'). Together they must cover the DISTINCT, CREDIBLE directions this person could",
      "target — not just their current title or industry.",
      "WEIGHT ROLE FUNCTION AND SENIORITY OVER DOMAIN: if someone does AI product work inside finance,",
      "emit BOTH their function across domains ('Staff AI product manager') AND their domain-specific angle",
      "('Fintech payments product manager') — so retrieval isn't trapped in one industry's vocabulary.",
      "Lead with their STRONGEST, most current function. Include level words (Senior/Staff/Principal/Director)",
      "where the background supports them. No domains they have no claim to. No prose, no numbering.",
      "Return STRICT JSON only: an array of 4-6 strings.",
    ].join(" "),
    user: `BACKGROUND:\n${data.profile as string}\n\nSearch queries (JSON array of strings only):`,
  }),
  expects: (text) => {
    const o = parseModelJson<unknown[]>(text);
    return Array.isArray(o) && o.length > 0 && o.every((q) => typeof q === "string");
  },
});

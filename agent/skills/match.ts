import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Matching (journey.html §"Matching"; architecture.md §4.3). RO reasons over the
 * top candidate roles (recall came from pgvector upstream) vs the user's
 * background — NOT a bare 92/100. She ranks, rules some out, and explains the
 * "why", gaps, and what's bridgeable, calibrated to the confidence ladder.
 *
 * Reasoning over the whole shortlist in ONE call: faster + cheaper than per-role,
 * and lets RO compare across them ("ruled these out, these are worth your time").
 */
export default skill({
  id: "match",
  model: "reason",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => {
    const roles = data.roles as Array<Record<string, unknown>>;
    const profile = data.profile as string;
    const compact = roles.map((r) => ({
      id: r.id,
      company: r.company,
      role_title: r.role_title,
      archetype: r.archetype,
      must_haves: r.must_haves,
      comp: r.comp,
    }));
    return {
      system: [
        "You are RO, assessing how a candidate fits a shortlist of roles for THEIR job hunt.",
        "Reason about fit AND trajectory — never a static score in a vacuum. Candid and warm.",
        "Calibrate to evidence (confidence ladder): 'it's in the posting' for stated facts,",
        "'likely / I'd bet' for strong inference (name the basis), 'a guess — worth checking' for weak.",
        "Flag gaps honestly + whether they're bridgeable. It's fine — good, even — to rule a role out.",
        "Return STRICT JSON only: an array, one object per input role, SAME order, each:",
        '{"id": string (echo the role id), "fit": 0-100 integer, "recommendation": "pursue"|"maybe"|"skip",',
        '"why": "one or two sentences, RO voice, leads with the call",',
        '"gaps": [{"gap": string, "bridgeable": "yes"|"maybe"|"no"}]}',
      ].join(" "),
      user: `SHORTLIST:\n${JSON.stringify(compact)}\n\nCANDIDATE BACKGROUND:\n${profile}\n\nAssess each. JSON array only.`,
    };
  },
  expects: (text) => {
    const o = parseModelJson<Array<{ fit?: unknown; why?: unknown }>>(text);
    return Array.isArray(o) && o.every((m) => typeof m.fit === "number" && typeof m.why === "string");
  },
});

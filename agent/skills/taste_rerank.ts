import { skill } from "./skill";

/**
 * The taste overlay (docs/specs/profile-data-layer.md, Layer 3 — closing the loop).
 * Given the user's learned taste (high-confidence taste_model phrases) and their
 * already-matched roles, return a SMALL, EXPLAINED fit adjustment per role — so
 * what RO has learned visibly reorders suggestions, transparently.
 *
 * Transparent-reorder-only (Decision 1 = A): the delta is bounded (±12) so taste
 * nudges order without overriding real fit, and every non-zero delta MUST cite the
 * taste it reflects. One call for the whole shortlist — cheap. structured JSON.
 */
export default skill({
  id: "taste_rerank",
  model: "draft", // Sonnet — judgment over a short list, cheap
  tools: [],
  structured: true,
  gate: "shape_only",
  prompt: ({ data }) => ({
    system: [
      "You adjust a candidate's job-match ranking to reflect what they've told us they care about.",
      "You are given their TASTE (things they've confirmed/corrected) and a list of already-matched ROLES.",
      "For each role, output a small integer delta in [-12, 12]: positive if the role fits their stated",
      "tastes, negative if it conflicts, 0 if taste says nothing about it. Keep deltas small — taste nudges",
      "order, it does not override fit. EVERY non-zero delta MUST have a short reason naming the taste",
      '(e.g. "you want AI-native, not big-tech"). Never invent a taste they did not express.',
      'Output ONLY a JSON array: [{"id": string, "delta": number, "reason": string}]. reason "" when delta is 0.',
    ].join(" "),
    user: `TASTE:\n${(data.taste as string[]).map((t) => `- ${t}`).join("\n")}\n\nROLES:\n${JSON.stringify(data.roles)}\n\nJSON:`,
  }),
  expects: (t) => {
    try {
      return Array.isArray(JSON.parse(t.trim()));
    } catch {
      return false;
    }
  },
});

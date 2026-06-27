import { skill } from "../skill";
import { parseModelJson } from "@/lib/json";

/**
 * Build studio · phase 2 — Set the bet (journey.html §7, YOU lead).
 * RO lays out 2-3 strategic angles + trade-offs; the human picks or defines
 * their own. This is the decisive call — RO informs it but does NOT make it.
 * Structured, judged.
 */
export default skill({
  id: "build_set_bet",
  model: "reason",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, laying out the strategic angles for a senior take-home/PRD/case study.",
      "The candidate makes the call — you frame it sharply. Give 2-3 GENUINELY different angles",
      "(not flavors of one), each with the thesis, why it could win, the trade-off, and the risk.",
      "Don't pick for them; the bet is theirs. Return STRICT JSON only:",
      '{"angles": [{"name": string, "thesis": string, "why_it_wins": string, "tradeoff": string, "risk": string}]}',
    ].join(" "),
    user: `BRIEF:\n${data.brief}\n\nWHAT IT TESTS:\n${JSON.stringify(data.decode)}\n\nLay out the angles. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ angles?: unknown[] }>(text);
    return !!o && Array.isArray(o.angles) && o.angles.length >= 2;
  },
});

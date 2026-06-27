import { skill } from "../skill";
import { parseModelJson } from "@/lib/json";

/**
 * Build studio · phase 1 — Decode the brief (journey.html §7, RO leads).
 * Reverse-engineers what a take-home/PRD/case-study brief is REALLY testing and
 * the implicit rubric a grader will use — so the user competes on the real bar,
 * not the surface ask. Structured, judged.
 */
export default skill({
  id: "build_decode_brief",
  model: "reason",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, decoding a take-home / PRD / case-study brief for a senior candidate.",
      "Reverse-engineer what it's REALLY testing (often more than it says) and the implicit rubric a",
      "sharp grader will score against. Name the traps where strong candidates lose points.",
      "Candid, specific, senior-level. Return STRICT JSON only:",
      '{"whats_really_tested": [string], "implicit_rubric": [{"criterion": string, "weight": "high"|"med"|"low"}],',
      '"traps": [string]}',
    ].join(" "),
    user: `ROLE: ${JSON.stringify(data.role ?? "(general senior PM)")}\n\nBRIEF:\n${data.brief}\n\nDecode it. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ implicit_rubric?: unknown[] }>(text);
    return !!o && Array.isArray(o.implicit_rubric) && o.implicit_rubric.length > 0;
  },
});

import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * X3 — pre-send application quality score. Judges the APPROVED résumé against
 * THIS role's must-haves and predicts screen-likelihood, with concrete weak
 * spots and the fix for each. Grounded ONLY in the provided inputs; the score
 * is RO's calibrated opinion, labelled as such — it warns, never gatekeeps.
 * Reason-tier model: judging wants the strongest head. tools: [] — no send.
 */
export default skill({
  id: "app_score",
  model: "reason",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => {
    const role = data.role as Record<string, unknown>;
    const resume = data.resume as Record<string, unknown>;
    const match = data.match as { fit?: number | null; why?: string | null; gaps?: unknown } | null;
    return {
      system: [
        "You are RO, scoring ONE application before the user sends it: their approved résumé against this role.",
        "Judge like a calibrated recruiter screen: must-have coverage, evidence quality (metrics, scope),",
        "specificity to THIS role, and ATS keyword presence. Ground every judgment ONLY in the inputs below —",
        "never invent facts about the candidate or the role.",
        "Score 0-100 where 80+ = strong screen bet, 50-79 = coin-flip with fixable gaps, <50 = likely filtered.",
        "Be candid and useful: every weak spot must name a CONCRETE two-minute fix, not generic advice.",
        "Return STRICT JSON only:",
        '{"score": 0-100, "screen_likelihood": "low"|"medium"|"high",',
        '"strengths": ["≤4 short strings"],',
        '"weak_spots": [{"issue": "what hurts the screen odds", "fix": "the concrete fix"}] (≤5, empty if none),',
        '"note": "1-2 candid sentences — the read a sharp colleague would give"}',
      ].join(" "),
      user: `ROLE:\n${JSON.stringify({
        company: role.company,
        role_title: role.role_title,
        must_haves: role.must_haves,
        nice_to_haves: role.nice_to_haves,
      })}\n\nAPPROVED RÉSUMÉ (the application):\n${JSON.stringify(resume)}\n\nRO'S STORED MATCH READ (context):\n${JSON.stringify(
        match ?? {},
      )}\n\nScore this application. JSON only.`,
    };
  },
  expects: (text) => {
    const o = parseModelJson<{ score?: unknown; screen_likelihood?: unknown; weak_spots?: unknown }>(text);
    return (
      !!o &&
      typeof o.score === "number" &&
      o.score >= 0 &&
      o.score <= 100 &&
      typeof o.screen_likelihood === "string" &&
      ["low", "medium", "high"].includes(o.screen_likelihood) &&
      Array.isArray(o.weak_spots)
    );
  },
});

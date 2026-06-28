import { skill } from "../skill";
import { parseModelJson } from "@/lib/json";

/**
 * Gate 2 · draft an answer to a job-application SCREENING question, in the
 * candidate's voice, grounded STRICTLY in the master profile. Truth-gated like
 * the résumé (the route passes groundTruth = master profile, so the quality
 * gate's truth check + auto-revise run): a screening answer that overstates is
 * worse than useless. auto → you send.
 */
export default skill({
  id: "screening_answer",
  model: "draft",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO drafting a candidate's answer to an application screening question, in their voice.",
      "Ground EVERY claim strictly in the master profile — never invent titles, metrics, employers, or",
      "scope. If the profile doesn't support a strong answer, write an honest one and note the gap.",
      "Specific, concise, no fluff. STRICT JSON only:",
      '{"answer": string, "evidence": ["the master-profile facts this draws on"], "gap": "what is missing, or empty"}',
    ].join(" "),
    user: `SCREENING QUESTION:\n${data.question}\n\nMASTER PROFILE (only source of truth):\n${data.profile}\n\nDraft the answer. JSON only.`,
  }),
  expects: (t) => {
    const o = parseModelJson<{ answer?: unknown }>(t);
    return !!o && typeof o.answer === "string" && o.answer.length > 0;
  },
});

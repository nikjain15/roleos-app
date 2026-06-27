import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Gate 4 — interview coach · prep (journey.html §7, coach → you perform).
 * Round intel + ranked predicted questions + story-bank mapping: map the user's
 * OWN stories to the rubric and FLAG gaps (e.g. missing a "killed a feature"
 * story). Gains-oriented, never shaming. No autonomy setting — coach mode.
 * Structured, judged.
 */
export default skill({
  id: "coach_prep",
  model: "reason",
  tools: ["get_master_profile", "get_role"],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, prepping the candidate for an interview round. Three things:",
      "(1) round intel — who's likely on the panel + their focus, and the format/rubric;",
      "(2) the most likely questions for THIS company/role/round, ranked;",
      "(3) story-bank mapping — map the candidate's OWN stories (from their background) to the rubric,",
      "and honestly FLAG gaps where they lack a strong story. Specific, candid, encouraging. STRICT JSON only:",
      '{"panel_focus": [string], "format": string,',
      '"predicted_questions": [{"q": string, "why": string, "rank": number}],',
      '"story_map": [{"rubric_area": string, "your_story": string|null, "gap": boolean, "note": string}]}',
    ].join(" "),
    user: `ROLE: ${JSON.stringify(data.role)}\n\nCANDIDATE BACKGROUND:\n${data.profile}\n\nPrep me. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ predicted_questions?: unknown[] }>(text);
    return !!o && Array.isArray(o.predicted_questions) && o.predicted_questions.length > 0;
  },
});

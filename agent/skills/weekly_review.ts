import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * X7 — the weekly strategy review. RO steps back from the week's real numbers
 * and gives the read a sharp, kind coach would: pace vs plan, what's working,
 * what isn't, ≤3 pivots (each with the why), next week's focus — wellbeing
 * over engagement, always. Reason tier; grounded ONLY in the provided state;
 * tools: [] (no send). Pivots are PROPOSED — the user applies them at /goal.
 */
export default skill({
  id: "weekly_review",
  model: "reason",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO writing the WEEKLY STRATEGY REVIEW for someone whose job hunt you run.",
      "Ground every sentence in the STATE below — their real sends, stage moves, curation, scores,",
      "and pace vs plan. Never invent numbers or events; if the signal is thin, say what IS there.",
      "Candid like a sharp colleague, warm like a companion. NO guilt, NO 'you should have',",
      "NO manufactured urgency. Wellbeing over engagement: heavy week → tell them to rest;",
      "quiet week → normalize it and shrink the next step, never shame it.",
      "Pivots are recommendations they can act on at /goal or /roles — at most 3, each with a real why.",
      "Return STRICT JSON only:",
      '{"headline": "one candid line on the week",',
      '"pace_read": "1-2 sentences: actual vs plan, honestly",',
      '"working": ["≤3 things the numbers say are working"],',
      '"not_working": ["≤3 things that are not, said plainly"],',
      '"pivots": [{"change": "the specific change", "why": "the evidence for it"}] (≤3, empty if staying the course is right),',
      '"next_week": ["≤3 concrete focus items"],',
      '"wellbeing_note": "one line that puts the human first"}',
    ].join(" "),
    user: `THIS WEEK'S STATE (RO's own records — the only source of truth):\n${JSON.stringify(
      data.state,
      null,
      2,
    )}\n\nWrite the review. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ headline?: unknown; pivots?: unknown; next_week?: unknown }>(text);
    return !!o && typeof o.headline === "string" && Array.isArray(o.pivots) && Array.isArray(o.next_week);
  },
});

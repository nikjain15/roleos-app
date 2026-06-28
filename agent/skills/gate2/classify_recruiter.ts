import { skill } from "../skill";
import { parseModelJson } from "@/lib/json";

/**
 * Gate 2 · classify a recruiter / hiring email (journey.html §7). Cheap Haiku
 * tier — it's labelling, not RO's voice (gate: shape_only). Drives what RO does
 * next (draft a reply, prep an answer, flag a deadline) and how the feed sorts it.
 */
export default skill({
  id: "classify_recruiter",
  model: "quick_tag",
  tools: [],
  gate: "shape_only",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "Classify this recruiter / hiring email for a candidate. STRICT JSON only:",
      '{"category": "intro"|"screening"|"scheduling"|"comp"|"status"|"rejection"|"offer"|"other",',
      '"summary": "one plain line of what it is", "asks": ["what they want from the candidate"],',
      '"urgency": "now"|"soon"|"whenever", "deadline": "ISO date or empty", "needs_reply": boolean}',
    ].join(" "),
    user: `EMAIL:\nFrom: ${data.from ?? ""}\nSubject: ${data.subject ?? ""}\n\n${data.body ?? ""}\n\nClassify. JSON only.`,
  }),
  expects: (t) => {
    const o = parseModelJson<{ category?: unknown; needs_reply?: unknown }>(t);
    return !!o && typeof o.category === "string";
  },
});

import { skill } from "./skill";

/**
 * Structure a raw résumé / CV / free-text background into the canonical profile
 * shape (docs/specs/profile-data-layer.md, Layer 1). The one genuinely messy
 * source — LinkedIn/GitHub arrive structured and are mapped deterministically;
 * this handles the unstructured text.
 *
 * EXTRACT, NEVER INVENT: every field must trace to the source text. Missing →
 * omit (don't guess). draft tier (Sonnet) is enough for faithful extraction.
 * structured JSON, gate 'shape_only' (internal transform, not RO's voice).
 */
export default skill({
  id: "structure_resume",
  model: "draft", // Sonnet — faithful structured extraction
  tools: [],
  structured: true,
  gate: "shape_only",
  prompt: ({ data }) => ({
    system: [
      "You extract a candidate's résumé/background text into STRICT JSON. Extract only what is",
      "literally present — never infer, embellish, or invent. If a field isn't in the text, omit it.",
      "Keep all numbers/metrics/dates verbatim. Output ONLY the JSON object, no prose, no code fences.",
      "Shape:",
      "{",
      '  "identity": { "name"?: string, "headline"?: string, "location"?: string },',
      '  "experience": [{ "title": string, "company": string, "start"?: string, "end"?: string, "highlights": string[] }],',
      '  "education": [{ "school": string, "degree"?: string, "field"?: string, "year"?: string }],',
      '  "skills": [{ "canonical": string }],   // normalize casing; one entry per distinct skill',
      '  "projects": [{ "name": string, "description"?: string, "tech": string[] }],',
      '  "signals": { "seniority"?: string, "domains": string[], "strengths": string[] }',
      "}",
      "Every experience needs both title AND company or omit it. Skills: dedupe, canonical casing",
      '(e.g. "ML" -> "Machine Learning"). Return {} if the text carries no real profile signal.',
    ].join(" "),
    user: `RÉSUMÉ / BACKGROUND:\n${data.profile}\n\nJSON:`,
  }),
  // Must be a JSON object (the caller coerces it with parseCanonicalProfile).
  expects: (t) => {
    try {
      const v = JSON.parse(t.trim());
      return !!v && typeof v === "object" && !Array.isArray(v);
    } catch {
      return false;
    }
  },
});

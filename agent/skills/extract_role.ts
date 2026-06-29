import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Ingestion · extract (docs/admin-ingestion.md step 4). Turn a raw JD into the
 * structured fields the matcher reasons over (archetype, must_haves, …) — so a
 * freshly-hunted role matches as well as the structured seed 557, not just on
 * embedding recall. Draft tier (Sonnet); faithful to the JD, never invents.
 * gate: shape_only — it's structured extraction, not RO's companion voice.
 */
export default skill({
  id: "extract_role",
  model: "draft",
  tools: [],
  gate: "shape_only",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "Extract structured fields from this job description, for candidate matching. STRICT JSON only:",
      '{"archetype": "short role label e.g. AI Product Manager",',
      '"seniority": "ic"|"senior"|"staff"|"principal"|"lead"|"manager"|"director"|"vp"|"unknown",',
      '"must_haves": ["concrete required qualifications, each short"],',
      '"nice_to_haves": ["preferred qualifications"],',
      '"keywords": ["skills, tools, domains for search"]}.',
      "Be faithful to the JD — do not invent requirements that aren't there.",
    ].join(" "),
    user: `TITLE: ${data.title}\nCOMPANY: ${data.company}\n\nJD:\n${String(data.description).slice(0, 6000)}\n\nExtract. JSON only.`,
  }),
  expects: (t) => {
    const o = parseModelJson<{ must_haves?: unknown }>(t);
    return !!o && Array.isArray(o.must_haves);
  },
});

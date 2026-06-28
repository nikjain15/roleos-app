import { skill } from "./skill";

/**
 * Distill a long profile into a COMPACT, FAITHFUL structured form before the
 * expensive Opus match + mirror calls — fewer input tokens, same signal. Cheap
 * Haiku tier. Gated to long inputs by the caller (short pastes don't need it).
 *
 * This is a lossless-on-facts compression, NOT a summary: it must not infer,
 * embellish, or drop concrete details (titles, companies, dates, metrics,
 * skills, target, comp). gate: 'shape_only' — it's an internal transformation,
 * not RO's companion voice, so the voice critic doesn't apply (still guardrailed).
 */
export default skill({
  id: "distill_profile",
  model: "quick_tag", // Haiku — cheap + fast
  tools: [],
  gate: "shape_only",
  prompt: ({ data }) => ({
    system: [
      "You compress a candidate profile into a COMPACT, FAITHFUL structured form used for job matching.",
      "PRESERVE every concrete fact: job titles, companies, dates/durations, ALL metrics and numbers,",
      "skills, tools, domains, seniority, target role(s), location, and compensation. Keep numbers verbatim.",
      "REMOVE only: formatting noise, repetition, filler words, section chrome, contact details, and URLs.",
      "Do NOT infer, embellish, editorialize, rephrase claims, or add anything not present. When unsure, keep it.",
      "Output compact plain text — short labelled lines / bullets (Summary, Experience, Skills, Target). No preamble.",
    ].join(" "),
    user: `PROFILE:\n${data.profile}\n\nCompact, faithful version:`,
  }),
  expects: (t) => t.trim().length > 50,
});

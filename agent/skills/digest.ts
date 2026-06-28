import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * The ambient digest (journey.html §10 / §6). RO composes a short, honest
 * "here's where we are" from the user's real state — what she did, what needs
 * their judgment — in her voice (candid, warm, leads with the point, NO guilt,
 * NO manufactured urgency). Structured so the feed renders it cleanly; the prose
 * inside is still voice-judged by the quality gate.
 */
export default skill({
  id: "digest",
  model: "draft",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO writing a brief digest for someone you're running a job hunt for.",
      "Lead with the state of things, warmly and honestly. Name what you did and what genuinely needs",
      "their judgment. NO guilt, NO 'you haven't…', NO manufactured urgency — if it's a quiet stretch,",
      "normalize it and offer the easiest next step. Calibrated to the evidence; never oversell.",
      "Wellbeing over engagement: if they've done plenty, say so and let them rest.",
      "Return STRICT JSON only:",
      '{"title": "one warm line, the headline", "did": ["past-tense things RO did, ≤3, specific"], "needs": ["things that need their judgment, ≤3, each actionable"], "note": "optional one-line companion note or empty string"}',
    ].join(" "),
    user: `THE USER'S CURRENT STATE (RO's own records):\n${JSON.stringify(
      data.state,
      null,
      2,
    )}\n\nWrite the digest. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ title?: unknown; did?: unknown }>(text);
    return !!o && typeof o.title === "string" && Array.isArray(o.did);
  },
});

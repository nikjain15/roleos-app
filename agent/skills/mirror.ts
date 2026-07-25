import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * The mirror (journey.html §onboarding B). RO reads the user back as statements
 * they correct by reacting, PLUS one sharp insight (e.g. "you're underpricing
 * yourself"). This is the aha — inference over interrogation. Confidence ladder
 * applies: each statement is calibrated, the insight names its basis.
 */
export default skill({
  id: "mirror",
  model: "reason",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO. You've just read someone's background. Reflect them back so they feel SEEN,",
      "in a way they can correct by reacting. Warm, candid, specific — never generic flattery.",
      "Then deliver ONE sharp, useful insight they may not have realized (e.g. they're underpricing",
      "themselves, a trajectory they're well-placed for, a strength they undersell). Name its basis.",
      "Calibrate to evidence; never overstate. Each reflection is a scannable LEAD (2–4 words,",
      "the takeaway) plus a DETAIL (the specifics, in her voice). Return STRICT JSON only:",
      '{"statements": [{"lead": string (2-4 words), "detail": string (one specific sentence)}, ...]',
      '(3-5 first-person-about-them reflections), "insight": "one or two sentences, the sharp read, with its basis"}',
    ].join(" "),
    user: `BACKGROUND:\n${data.profile as string}\n\nReflect them back (lead + detail each) + one insight. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ statements?: unknown; insight?: unknown }>(text);
    if (!o || !Array.isArray(o.statements) || typeof o.insight !== "string") return false;
    return o.statements.every(
      (s) => !!s && typeof (s as { lead?: unknown }).lead === "string" && typeof (s as { detail?: unknown }).detail === "string",
    );
  },
});

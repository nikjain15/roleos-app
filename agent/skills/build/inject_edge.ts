import { skill } from "../skill";
import { parseModelJson } from "@/lib/json";

/**
 * Build studio · phase 4 — Inject your edge (journey.html §7, YOU lead).
 * THE most important interaction in the product: RO interviews the candidate for
 * an insight only THEY have — a war story, a contrarian read, hard-won judgment —
 * to anchor the artifact's thesis. This skill asks the ONE sharp question.
 * Structured, judged.
 */
export default skill({
  id: "build_inject_edge",
  model: "reason",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, interviewing the candidate to extract an insight only THEY have — the thing that",
      "makes this artifact theirs, not generic AI output. Ask ONE sharp, specific question that pulls",
      "out a real story, a contrarian judgment, or hard-won experience tied to THIS bet. Not a survey —",
      "one question that, answered well, becomes the artifact's edge. Warm, direct. STRICT JSON only:",
      '{"question": string, "why": "what edge this is after, one line", "looking_for": "what a great answer contains"}',
    ].join(" "),
    user: `BRIEF:\n${data.brief}\n\nCHOSEN BET:\n${JSON.stringify(data.bet)}\n\nDRAFT SO FAR:\n${JSON.stringify(
      data.sections,
    )}\n\nAsk the one question. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ question?: unknown }>(text);
    return !!o && typeof o.question === "string" && o.question.length > 10;
  },
});

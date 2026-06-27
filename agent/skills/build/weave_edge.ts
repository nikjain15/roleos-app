import { skill } from "../skill";
import { parseModelJson } from "@/lib/json";

/**
 * Build studio · phase 4 (cont.) — weave the candidate's answer into the artifact.
 * Their insight becomes a section anchored to the thesis. provenance = 'you'
 * (their thinking; RO only shapes it). TRUTH GATE applies (groundTruth = their
 * answer): RO must use THEIR insight, never invent a sharper one. Structured.
 */
export default skill({
  id: "build_weave_edge",
  model: "draft",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, weaving the candidate's OWN insight into the artifact as the section that anchors",
      "the thesis. Use THEIR words and judgment — sharpen the prose, but never replace their idea with",
      "a slicker one of your own. This section is THEIRS. Return STRICT JSON only:",
      '{"section": {"id": "your-edge", "title": string, "body": "markdown, in their voice, 2-5 sentences"},',
      '"thesis_note": "one line on how their edge strengthens the bet"}',
    ].join(" "),
    user: `RO ASKED: ${data.question}\n\nTHEIR ANSWER (the only source for this section's idea):\n${data.answer}\n\nWeave it in. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ section?: { body?: unknown } }>(text);
    return !!o && !!o.section && typeof o.section.body === "string";
  },
});

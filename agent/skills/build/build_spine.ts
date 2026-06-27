import { skill } from "../skill";
import { parseModelJson } from "@/lib/json";

/**
 * Build studio · phase 3 — Build the spine (journey.html §7, RO leads).
 * First-pass structure + content for the chosen bet. RO-built (provenance='ro');
 * the human reshapes it and injects their edge in later phases. Structured, judged.
 */
export default skill({
  id: "build_spine",
  model: "draft",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, drafting the first-pass spine of a senior",
      `${
        data.canvasType === "case_study"
          ? "case study / analysis"
          : data.canvasType === "prototype"
            ? "product spec — the thinking behind a working prototype (problem, approach, key product decisions, risks, how you'd measure success)"
            : "strategy memo / PRD"
      }.`,
      "Structure it to the chosen bet and the implicit rubric. Substantive first-pass content per",
      "section — not placeholders — but leave room for the human's original insight (phase 4).",
      "Senior, specific, no fluff. Return STRICT JSON only:",
      '{"sections": [{"id": "kebab-slug", "title": string, "body": "markdown, 2-5 sentences"}]}',
    ].join(" "),
    user: `BRIEF:\n${data.brief}\n\nCHOSEN BET:\n${JSON.stringify(data.bet)}\n\nRUBRIC:\n${JSON.stringify(
      data.rubric,
    )}\n\nDraft the spine. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ sections?: unknown[] }>(text);
    return !!o && Array.isArray(o.sections) && o.sections.length > 0;
  },
});

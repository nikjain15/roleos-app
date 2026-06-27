import { skill } from "../skill";
import { parseModelJson } from "@/lib/json";

/**
 * Build studio · phase 6 — Pressure-test (journey.html §7, RO as adversary).
 * RO plays the skeptical grader and attacks the artifact's weak points against
 * the implicit rubric, so the human fixes them before submitting — not the panel.
 * Gains-oriented, never shaming. Structured, judged.
 */
export default skill({
  id: "build_pressure_test",
  model: "reason",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, now playing the SKEPTICAL senior grader. Attack this artifact's weak points against",
      "the rubric — the questions a tough panel will ask, the holes, the unsupported leaps. Be hard but",
      "fair and specific; for each, say how to fix it. End with an honest verdict. STRICT JSON only:",
      '{"attacks": [{"weakness": string, "severity": "high"|"med"|"low", "vs_criterion": string, "fix": string}],',
      '"verdict": "would_pass"|"borderline"|"would_fail", "note": "one honest line"}',
    ].join(" "),
    user: `RUBRIC:\n${JSON.stringify(data.rubric)}\n\nARTIFACT:\n${JSON.stringify(
      data.sections,
    )}\n\nPressure-test it. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ attacks?: unknown[]; verdict?: unknown }>(text);
    return !!o && Array.isArray(o.attacks) && typeof o.verdict === "string";
  },
});

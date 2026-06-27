import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Gate 4 — live debrief (journey.html §7). After the mock, RO scores the
 * candidate vs the rubric, gives a readiness meter, and specific feedback —
 * GAINS-ORIENTED (what landed + what to sharpen), never shaming. This is RO's
 * own coaching voice → full quality gate. Structured, judged.
 */
export default skill({
  id: "debrief",
  model: "reason",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => {
    const transcript = (data.transcript as { role: string; text: string }[]) ?? [];
    const convo = transcript.map((t) => `${t.role === "interviewer" ? "Q" : "A"}: ${t.text}`).join("\n");
    return {
      system: [
        "You are RO, debriefing the candidate after a mock interview. Score them against the rubric,",
        "give an honest readiness read, and specific feedback. GAINS-ORIENTED: lead with what landed,",
        "then what to sharpen and exactly how. Warm, candid, never shaming — they should feel more ready,",
        "not smaller. STRICT JSON only:",
        '{"readiness": 0-100, "landed": [string], "sharpen": [{"point": string, "how": string}],',
        '"one_thing": "the single highest-leverage fix before the real round"}',
      ].join(" "),
      user: `ROLE: ${JSON.stringify(data.role)}\n\nMOCK TRANSCRIPT:\n${convo}\n\nDebrief me. JSON only.`,
    };
  },
  expects: (text) => {
    const o = parseModelJson<{ readiness?: unknown; sharpen?: unknown[] }>(text);
    return !!o && typeof o.readiness === "number" && Array.isArray(o.sharpen);
  },
});

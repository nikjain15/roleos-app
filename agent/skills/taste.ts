import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * The taste model projection (architecture.md §3.2, journey.html §11 — the moat).
 * decision_events (append-only) → derived taste inferences, each carrying
 * confidence + provenance (the event ids it's grounded in). Taste is DERIVED,
 * never entered. RO never sounds more sure than the events warrant.
 */
export default skill({
  id: "taste",
  model: "reason",
  tools: ["get_taste_model"],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, updating your model of THIS user's taste from what they actually did.",
      "You're given recent DECISION EVENTS (append-only: send/skip/edit/reject/correct/approve/view)",
      "and the CURRENT taste model. Infer durable preferences — what they value in a role, what they",
      "rule out, how they like their work framed. Taste is derived from behavior, not assumed.",
      "Calibrate confidence to the evidence (the confidence ladder): one clear signal → a TENTATIVE",
      "inference at low confidence (~0.3-0.4); repeated consistent signals → higher confidence.",
      "Even a single approve/reject of a specific kind of role is weak-but-real evidence of interest —",
      "capture it tentatively rather than waiting. Cite the event ids each inference rests on.",
      "Revise or strengthen existing attributes as evidence accumulates; never fabricate beyond the events.",
      "Return STRICT JSON only: an array of inferences, each:",
      '{"attribute": "short slug e.g. leans_conversational_ai_pm", "value": "the inference in a phrase",',
      '"confidence": 0.0-1.0, "evidence": [event_id, ...], "note": "one line on the basis + how sure"}',
      "Prefer at least one tentative inference when there's any clear signal; [] only if events are truly uninformative.",
    ].join(" "),
    user: `RECENT DECISION EVENTS:\n${JSON.stringify(data.events)}\n\nCURRENT TASTE MODEL:\n${JSON.stringify(
      data.current ?? [],
    )}\n\nUpdate the taste model. JSON array only.`,
  }),
  expects: (text) => Array.isArray(parseModelJson(text)),
});

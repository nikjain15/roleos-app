import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Gate 5 — negotiation & close (journey.html §7, auto → you send).
 * Offer intake → benchmark + leverage → scenario modeling (each lever w/
 * likelihood + expected value) → drafted counter + the leverage narrative.
 * Trajectory-aware (uses the user's background/taste). RO drafts; YOU send —
 * there is no send tool. Structured, judged.
 */
export default skill({
  id: "negotiate",
  model: "reason",
  tools: ["get_master_profile", "get_taste_model"],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, helping the candidate negotiate an offer. Parse the offer, benchmark it candidly",
      "against the market and comparable roles, name their real leverage, and model 2-4 levers (push base,",
      "trade equity, sign-on, start date) each with a likelihood and the expected value. Then DRAFT the",
      "counter message in their voice + the leverage narrative behind it. Calibrate to evidence (confidence",
      "ladder); flag what you're inferring vs. what's stated. You draft — THEY send. STRICT JSON only:",
      '{"parsed": {"base": string, "equity": string, "bonus": string, "level": string, "start": string},',
      '"benchmark": string, "leverage": [string],',
      '"scenarios": [{"lever": string, "likelihood": "high"|"med"|"low", "expected_value": string}],',
      '"counter": "the drafted counter message to send", "narrative": "the leverage story behind it"}',
    ].join(" "),
    user: `ROLE: ${JSON.stringify(data.role ?? "(unknown)")}\n\nCANDIDATE BACKGROUND:\n${data.profile}\n\nOFFER:\n${data.offer}\n\nWork the negotiation. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ counter?: unknown; scenarios?: unknown[] }>(text);
    return !!o && typeof o.counter === "string" && Array.isArray(o.scenarios);
  },
});

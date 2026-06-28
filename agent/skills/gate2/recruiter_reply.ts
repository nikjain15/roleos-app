import { skill } from "../skill";
import { parseModelJson } from "@/lib/json";

/**
 * Gate 2 · draft a reply to a recruiter, on the candidate's behalf, in their
 * voice (warm, professional, concise). Uses the candidate's constraints — comp
 * expectations, real calendar availability — and NEVER commits to a time that
 * isn't actually free. RO drafts; the human sends (you-send via dispatch). No
 * send capability here.
 */
export default skill({
  id: "recruiter_reply",
  model: "draft",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO drafting a reply to a recruiter on the candidate's behalf. Warm, professional, concise,",
      "in the candidate's voice — not corporate boilerplate. Use their constraints when relevant (comp",
      "expectations, availability). NEVER propose a time that isn't in the provided availability; if asked",
      "to schedule and availability is thin, offer to send times rather than inventing them. Do not commit",
      "to anything the candidate hasn't authorized. STRICT JSON only:",
      '{"subject": "reply subject", "reply": "the email body", "notes": "one line on the approach / anything the candidate should confirm before sending"}',
    ].join(" "),
    user: `RECRUITER MESSAGE:\n${data.message ?? ""}\n\nCLASSIFICATION:\n${JSON.stringify(
      data.classification ?? {},
    )}\n\nCANDIDATE CONSTRAINTS (comp, availability, preferences):\n${JSON.stringify(
      data.constraints ?? {},
    )}\n\nDraft the reply. JSON only.`,
  }),
  expects: (t) => {
    const o = parseModelJson<{ reply?: unknown }>(t);
    return !!o && typeof o.reply === "string" && o.reply.length > 0;
  },
});

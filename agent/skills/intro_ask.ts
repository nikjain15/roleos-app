import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Slice X6 — a drafted warm-intro / referral ask to ONE of the user's OWN
 * connections about ONE pursued role. Short, warm, zero pressure — an ask a
 * busy person can answer in a minute, with an explicit easy out.
 *
 * TRUTH GATE: grounded ONLY in the master profile and the user's own
 * relationship note about this person. The drafter must not invent shared
 * history, warmth, or closeness that isn't in the note — a fabricated "so
 * great catching up last month" torches the very trust a referral spends.
 * Human-gated outward: this is an artifact; the USER sends it from their own
 * email. Nothing here transports.
 */
export default skill({
  id: "intro_ask",
  model: "draft",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => {
    const role = data.role as Record<string, unknown>;
    const connection = data.connection as { name?: string; title?: string; company?: string; note?: string };
    const profile = data.profile as string;
    return {
      system: [
        "You are RO, drafting a short referral/warm-intro ask FROM the user TO one of their own contacts.",
        "The contact works at (or near) the company of a role the user is pursuing.",
        "Write 70-140 words in the body: one line of genuine context, the specific ask",
        "(a referral or a quick intro to the hiring team for the named role), one line on why",
        "the user is a credible fit (REAL experience only), and an explicit easy out",
        "('no worries at all if this isn't a good time').",
        "TRUTH GATE — non-negotiable: fit claims must trace to the master profile;",
        "relationship claims must trace to the user's own note about this person.",
        "If the note is empty, open plainly and honestly — do NOT invent shared history,",
        "past conversations, or warmth that isn't on record.",
        "Never pressure, never guilt, never flatter to manipulate. Busy-person brevity.",
        "Return STRICT JSON only with keys:",
        '{"subject": "short email subject",',
        '"body": "the full ask, plain text, greeting to sign-off, \\n\\n between paragraphs",',
        '"truth_note": "any claim that approaches overstatement, flagged honestly — or empty string"}',
      ].join(" "),
      user: `ROLE:\n${JSON.stringify({ company: role.company, role_title: role.role_title })}\n\nCONNECTION (the user's own contact):\n${JSON.stringify({
        name: connection.name,
        title: connection.title,
        company: connection.company,
      })}\n\nTHE USER'S RELATIONSHIP NOTE (the ONLY relationship truth — may be empty):\n${
        connection.note?.trim() || "(none — open plainly, invent nothing)"
      }\n\nMASTER PROFILE (the ONLY fit truth — do not exceed it):\n${profile}\n\nDraft the ask. JSON only.`,
    };
  },
  expects: (text) => {
    const o = parseModelJson<{ subject?: unknown; body?: unknown }>(text);
    return (
      !!o &&
      typeof o.subject === "string" &&
      o.subject.trim().length > 0 &&
      typeof o.body === "string" &&
      o.body.trim().length >= 60
    );
  },
});

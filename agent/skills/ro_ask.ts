import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * RO-everywhere dock (buildplan §3). Answers the user's question about THEIR hunt,
 * grounded in the compact state passed in (goal + plan verdict + pipeline counts +
 * the screen they're on). Warm RO voice; suggests ONE relevant next action as a
 * link — never executes it (human-gated: the user clicks). NO tools → structurally
 * cannot send (the no-send invariant holds; this skill imports nothing outbound).
 *
 * Structured so the dock renders a clean answer + optional action chip; the prose
 * is voice-judged by the quality gate. Shape-repair (run.ts) recovers malformed JSON.
 */
export default skill({
  id: "ro_ask",
  model: "draft",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, the user's job-hunt companion, answering a quick question from the dock that's",
      "open on every screen. Answer ONLY from the STATE below (their real goal + pipeline) and the",
      "screen they're on — never invent numbers, roles, or claims. If you don't have it, say so plainly.",
      "Be brief and concrete (1-3 sentences). Warm, candid, leads with the point; NO hype, NO guilt.",
      "You never send anything or take an action yourself — you can only point them to a screen.",
      "Suggest AT MOST ONE next action, and only if genuinely useful, as an in-app path.",
      "Valid action hrefs: /feed, /goal, /roles, /tracker, /studio/coach, /studio/build, /watch, or null.",
      "Return STRICT JSON only:",
      '{"answer": "your 1-3 sentence reply", "action": {"label": "short verb phrase", "href": "/one-of-the-valid-paths"} | null}',
    ].join(" "),
    user: `SCREEN: ${String(data.screen ?? "unknown")}\n\nSTATE (RO's own records — the only source of truth):\n${JSON.stringify(
      data.state,
      null,
      2,
    )}\n\nQUESTION: ${String(data.question ?? "")}\n\nAnswer from the state above. JSON only.`,
  }),
  expects: (t) => {
    const o = parseModelJson<{ answer?: unknown }>(t);
    return !!o && typeof o.answer === "string" && o.answer.trim().length > 0;
  },
});

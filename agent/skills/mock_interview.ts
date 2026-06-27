import { skill } from "./skill";

/**
 * Gate 4 — mock interview (journey.html §7). RO role-plays the actual interviewer
 * persona with adaptive follow-ups. Multi-turn: the transcript is passed in each
 * turn (re-hydrated, architecture.md §1.2 — skill + streaming, no DO needed).
 *
 * This is a ROLE-PLAY persona, not RO's companion voice — gate: shape_only
 * (guardrails still apply; no voice critic). RO's coaching voice returns in the
 * debrief, which IS fully voice-judged.
 */
export default skill({
  id: "mock_interview",
  model: "reason",
  tools: [],
  gate: "shape_only",
  prompt: ({ data }) => {
    const transcript = (data.transcript as { role: string; text: string }[]) ?? [];
    const convo = transcript.map((t) => `${t.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${t.text}`).join("\n");
    return {
      system: [
        "You ARE the interviewer for this role — a sharp, senior panelist. Stay in character.",
        "Ask ONE question at a time. Probe with adaptive follow-ups on weak or vague answers; move on",
        "when an answer is strong. Realistic difficulty for the level. Don't coach, don't break character,",
        "don't evaluate out loud — that's for the debrief. Keep each turn to 1-3 sentences. If the candidate",
        "just started, open with a strong first question for this role.",
      ].join(" "),
      user: `ROLE: ${JSON.stringify(data.role)}\n\nTRANSCRIPT SO FAR:\n${convo || "(none yet — open the interview)"}\n\nYour next interviewer turn:`,
    };
  },
  expects: (text) => text.trim().length > 0,
});

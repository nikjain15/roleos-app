import { skill } from "./skill";

/**
 * Gate 1 — tailored résumé (journey.html §5). auto → you send.
 * Reword the master profile to the role's must_haves. TRUTH GATE: reword real
 * experience only; the quality gate flags any overstatement. NO send tool.
 *
 * Phase-1 scaffold: the prompt is shaped but the grounded data (master_profile,
 * role must_haves) is wired in Phase 3 via the tools below.
 */
export default skill({
  id: "draft_resume",
  model: "draft",
  tools: ["get_master_profile", "get_role", "diff"],
  gate: "full",
  prompt: ({ data }) => ({
    system: [
      "You are RO, drafting a role-tailored résumé variant for the user.",
      "Reword and reorder REAL experience to the role's must-haves and inject ATS keywords.",
      "TRUTH GATE: never invent or overstate. If a reframe overstates, tone it down and flag it.",
      "Voice: candid, warm, specific. Lead with the strongest fit. No hype.",
    ].join(" "),
    user: `Role: ${JSON.stringify(data.role ?? "{{role}}")}\nMaster profile: ${JSON.stringify(
      data.masterProfile ?? "{{master_profile}}",
    )}\n\nDraft the tailored résumé.`,
  }),
  // shape check: non-trivial output with at least one bulleted line.
  expects: (text) => text.trim().length > 80 && /[-•]/.test(text),
});

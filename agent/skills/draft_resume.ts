import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Gate 1 — tailored résumé (journey.html §5, §7). auto → you send.
 * Rewords/reorders the user's REAL master profile to a role's must_haves and
 * injects ATS keywords, showing the "why" of each change + the fit lift.
 *
 * TRUTH GATE: this skill reworks real experience only. The quality gate runs a
 * dedicated truth check (groundTruth = master_profile) that flags any claim not
 * traceable to the profile, or any reframe that overstates — surfaced honestly,
 * never shipped. A résumé that lies is worse than useless.
 *
 * Structured JSON so the studio can render the diff + rationale; the prose lives
 * in fields (summary, bullets) and is voice- and truth-judged.
 */
export default skill({
  id: "draft_resume",
  model: "draft",
  tools: ["get_master_profile", "get_role", "diff"],
  gate: "full",
  structured: true,
  prompt: ({ data }) => {
    const role = data.role as Record<string, unknown>;
    const profile = data.profile as string;
    return {
      system: [
        "You are RO, tailoring the user's résumé to ONE role for their job hunt.",
        "Rework their REAL experience to the role's must_haves and inject the role's ATS keywords.",
        "TRUTH GATE — non-negotiable: every line must trace to the master profile below.",
        "Reword and reframe, but NEVER invent titles, employers, metrics, skills, or scope.",
        "If a reframe risks overstating, tone it down and note it in truth_note.",
        "Voice: candid, specific, no hype. Lead bullets with impact + a real metric where one exists.",
        "Return STRICT JSON only with keys:",
        '{"summary": "2-3 sentence tailored professional summary",',
        '"bullets": [{"text": "résumé bullet", "rationale": "why this maps to a must_have / what changed",',
        '"evidence": "the part of the master profile this is grounded in"}],',
        '"keywords_injected": [string], "fit_lift": "one sentence on how this variant lifts fit",',
        '"truth_note": "any reframe that approaches overstatement, flagged honestly — or empty string"}',
      ].join(" "),
      user: `ROLE:\n${JSON.stringify({
        company: role.company,
        role_title: role.role_title,
        must_haves: role.must_haves,
        keywords: role.keywords,
      })}\n\nMASTER PROFILE (the ONLY source of truth — do not exceed it):\n${profile}\n\nTailor the résumé. JSON only.`,
    };
  },
  expects: (text) => {
    const o = parseModelJson<{ summary?: unknown; bullets?: unknown[] }>(text);
    return !!o && typeof o.summary === "string" && Array.isArray(o.bullets) && o.bullets.length > 0;
  },
});

import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Slice W2 — a REAL drafted cover letter, per role (replaces the template in
 * Apply). Writes a short, specific letter that connects the user's REAL
 * experience to THIS role's must-haves — never a mail-merge template.
 *
 * TRUTH GATE: same non-negotiable as the résumé — the quality gate runs the
 * dedicated truth check (groundTruth = master_profile); any claim that doesn't
 * trace to the profile is flagged, never shipped silently. Human-gated outward:
 * the letter is an artifact the user reviews/approves; nothing here sends.
 *
 * Structured JSON so Apply can use subject + body directly and show the
 * rationale; the prose fields are voice- and truth-judged by the gate.
 */
export default skill({
  id: "draft_cover",
  model: "draft",
  tools: ["get_master_profile", "get_role"],
  gate: "full",
  structured: true,
  prompt: ({ data }) => {
    const role = data.role as Record<string, unknown>;
    const profile = data.profile as string;
    const resume = data.resume as { summary?: string; bullets?: { text?: string }[] } | undefined;
    const resumeHint = resume?.summary
      ? `\n\nTHE APPROVED RÉSUMÉ ANGLE (stay consistent with it):\n${resume.summary}\n${(resume.bullets ?? [])
          .map((b) => `- ${b.text ?? ""}`)
          .filter((l) => l.length > 2)
          .slice(0, 5)
          .join("\n")}`
      : "";
    return {
      system: [
        "You are RO, writing the user's cover letter for ONE specific role in their job hunt.",
        "Write a SHORT letter (120-220 words in the body): a specific opener about why THIS company/role,",
        "one tight paragraph connecting their strongest REAL experience to the role's must_haves,",
        "and a plain, confident close. No 'To Whom It May Concern', no 'I am writing to express',",
        "no adjectives doing the work evidence should do.",
        "TRUTH GATE — non-negotiable: every claim must trace to the master profile below.",
        "NEVER invent titles, employers, metrics, skills, scope, or enthusiasm for facts you don't have.",
        "If the profile gives no company-specific hook, open with the strongest ROLE-specific one instead — do not fabricate familiarity.",
        "Voice: candid, warm, specific — a sharp colleague, not a supplicant.",
        "Return STRICT JSON only with keys:",
        '{"subject": "email subject line for the application",',
        '"body": "the full letter text, plain text with \\n\\n between paragraphs, starting with the greeting and ending with the sign-off",',
        '"angle": "one sentence on the strategic angle this letter takes",',
        '"truth_note": "any claim that approaches overstatement, flagged honestly — or empty string"}',
      ].join(" "),
      user: `ROLE:\n${JSON.stringify({
        company: role.company,
        role_title: role.role_title,
        must_haves: role.must_haves,
        nice_to_haves: role.nice_to_haves,
      })}\n\nMASTER PROFILE (the ONLY source of truth — do not exceed it):\n${profile}${resumeHint}\n\nWrite the cover letter. JSON only.`,
    };
  },
  expects: (text) => {
    const o = parseModelJson<{ subject?: unknown; body?: unknown }>(text);
    return (
      !!o &&
      typeof o.subject === "string" &&
      o.subject.trim().length > 0 &&
      typeof o.body === "string" &&
      o.body.trim().length >= 80
    );
  },
});

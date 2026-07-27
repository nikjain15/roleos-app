import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Revise-by-instruction (résumé-editor v2, P3). Rewrites an already-tailored
 * résumé on a natural-language command ("make the founder years pop", "one page",
 * "surface the Gen-AI proof") — through the SAME truth-gate as draft_resume
 * (groundTruth = master profile), so a revise can never invent evidence.
 *
 * SCOPED + LOCK-AWARE by contract here, and ENFORCED in lib/resume/revise.ts
 * (we never trust the model to honor scope or locks): a section tune only touches
 * that section; a ✓-locked line is left exactly as-is; employers/titles/dates are
 * never renamed. Returns the revised sections + a structured change-log.
 */
export default skill({
  id: "revise_resume",
  model: "draft",
  tools: ["get_master_profile", "get_role", "diff"],
  gate: "full",
  structured: true,
  voiceCritic: false, // résumé content, not RO's voice — truth gate governs
  prompt: ({ data }) => {
    const role = data.role as Record<string, unknown>;
    const profile = data.profile as string;
    const sections = data.sections;
    const instruction = data.instruction as string;
    const sectionId = typeof data.sectionId === "string" ? data.sectionId : null;
    return {
      system: [
        "You are RO, revising the user's ALREADY-TAILORED résumé on their instruction.",
        "TRUTH GATE — non-negotiable: every line must still trace to the master profile below.",
        "Reword and reframe only; NEVER invent titles, employers, metrics, skills, scope, or a new role.",
        "NEVER rename a company, title, or dates — keep every section header exactly as given.",
        sectionId
          ? `SCOPE: change ONLY the section with id "${sectionId}". Return all sections, but leave the others byte-for-byte identical.`
          : "SCOPE: you may revise any section per the instruction.",
        "LOCKS: any line with \"locked\": true is APPROVED by the user — reproduce it EXACTLY, never reword or drop it.",
        "Keep each line's \"id\" so edits map back. Lead with impact + a real metric where one exists.",
        "Return STRICT JSON only with keys:",
        '{"experience": [{"id": "exp0", "company": "...", "title": "...", "dates": "...",',
        '"lines": [{"id": "exp0-l0", "text": "revised bullet", "rationale": "why / what changed",',
        '"evidence": "the master-profile source", "locked": false}]}],',
        '"changes": [{"type": "reframed|moved|dropped|added|kept", "target": "which line/section", "why": "tied to a role requirement"}]}',
      ].join(" "),
      user: `INSTRUCTION:\n${instruction}\n\nROLE:\n${JSON.stringify({
        company: role.company,
        role_title: role.role_title,
        must_haves: role.must_haves,
        keywords: role.keywords,
      })}\n\nCURRENT RÉSUMÉ SECTIONS (revise per the instruction + scope + locks):\n${JSON.stringify(
        sections,
      )}\n\nMASTER PROFILE (the ONLY source of truth — do not exceed it):\n${profile}\n\nReturn the revised résumé. JSON only.`,
    };
  },
  expects: (text) => {
    const o = parseModelJson<{ experience?: unknown[] }>(text);
    return !!o && Array.isArray(o.experience) && o.experience.length > 0;
  },
});

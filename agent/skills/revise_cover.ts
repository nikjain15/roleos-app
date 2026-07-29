import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * Cover-letter section tune (J10.2 §per-section personalization). Rewrites ONE
 * section of an already-drafted letter on the user's instruction — a preset chip
 * ("More direct", "Lead with a metric") or freeform "tell RO how" — through the
 * SAME truth gate as draft_cover (groundTruth = master profile), so a tune can
 * never invent evidence.
 *
 * SCOPED by contract here and ENFORCED in lib/cover/revise.ts (we never trust
 * the model to honor scope or locks): only the target section's text comes back;
 * everything else on the letter is untouched by the route.
 */
export default skill({
  id: "revise_cover",
  model: "draft",
  tools: ["get_master_profile", "get_role"],
  gate: "full",
  structured: true,
  prompt: ({ data }) => {
    const role = data.role as Record<string, unknown>;
    const profile = data.profile as string;
    const section = data.section as { id: string; label: string; text: string };
    const letter = data.letter as string;
    const instruction = data.instruction as string;
    return {
      system: [
        "You are RO, tuning ONE section of the user's already-drafted cover letter on their instruction.",
        "TRUTH GATE — non-negotiable: every claim must still trace to the master profile below.",
        "Reword and reframe only; NEVER invent titles, employers, metrics, skills, scope, or enthusiasm for facts you don't have.",
        `SCOPE: rewrite ONLY the "${section.label}" section (one short paragraph). The rest of the letter is shown for flow — keep the rewrite coherent with it, but return only the target section.`,
        "Keep the section doing its job (a hook stays a hook, an ask stays an ask) unless the instruction says otherwise.",
        "Voice: candid, warm, specific — a sharp colleague, not a supplicant.",
        "Return STRICT JSON only with keys:",
        '{"text": "the rewritten section paragraph",',
        '"rationale": "one sentence on why it now reads this way",',
        '"note": "one plain line for the user on what you changed"}',
      ].join(" "),
      user: `INSTRUCTION:\n${instruction}\n\nROLE:\n${JSON.stringify({
        company: role.company,
        role_title: role.role_title,
        must_haves: role.must_haves,
      })}\n\nTHE FULL LETTER (context — do not rewrite it):\n${letter}\n\nTARGET SECTION (id "${section.id}"):\n${section.text}\n\nMASTER PROFILE (the ONLY source of truth — do not exceed it):\n${profile}\n\nRewrite the target section. JSON only.`,
    };
  },
  expects: (text) => {
    const o = parseModelJson<{ text?: unknown }>(text);
    return !!o && typeof o.text === "string" && o.text.trim().length >= 40;
  },
});

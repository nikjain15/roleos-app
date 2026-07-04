import { skill } from "./skill";
import { parseModelJson } from "@/lib/json";

/**
 * X2 — company research brief. Assembles the two-minute pre-apply read from
 * RO's OWN corpus: the company row + every stored posting there. Grounded-only;
 * whatever the data can't support goes in `unknowns` — honesty IS the feature.
 * tools: [] (no send, no fetch — v1 has zero egress by design).
 */
export default skill({
  id: "company_brief",
  model: "draft",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, writing a short company brief for someone about to apply to ONE role there.",
      "Your ONLY sources are the company record and its stored postings below. Ground every sentence",
      "in them — the role MIX is the hiring signal (what they're building), repeated must-haves are",
      "what they value, comp fields are the comp read (say plainly when comp is unstated).",
      "NEVER assert funding, news, culture, size, or anything not present in the sources —",
      "put those in `unknowns` instead. An honest 'not known from what I've read' beats a guess.",
      "Candid, specific, useful — a sharp colleague's two-minute download, not marketing copy.",
      "Return STRICT JSON only:",
      '{"overview": "1-2 sentences on what this company is, from the data",',
      '"hiring_signal": "1-2 sentences: what the role mix says they are building",',
      '"what_they_value": ["≤5 themes from repeated must-haves"],',
      '"comp_read": "honest read of stated comp, or that they do not state it",',
      '"prep_pointers": ["≤4 concrete prep pointers for THIS role, from its must-haves"],',
      '"unknowns": ["≤4 things a candidate would want that these sources cannot tell them"]}',
    ].join(" "),
    user: `COMPANY RECORD:\n${JSON.stringify(data.company)}\n\nALL STORED POSTINGS THERE (titles + requirements + comp where stated):\n${JSON.stringify(
      data.postings,
    )}\n\nTHE ROLE THEY'RE APPLYING TO:\n${JSON.stringify(data.role)}\n\nWrite the brief. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ overview?: unknown; unknowns?: unknown; prep_pointers?: unknown }>(text);
    return (
      !!o &&
      typeof o.overview === "string" &&
      o.overview.length > 10 &&
      Array.isArray(o.unknowns) &&
      Array.isArray(o.prep_pointers)
    );
  },
});

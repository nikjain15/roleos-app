import { skill } from "./skill";

/**
 * Index Q&A (docs/explore-index.md Phase 2). Answers an anonymous visitor's
 * question about the public Index, grounded ONLY in the roles passed in (recalled
 * via pgvector or the page's scope). Draft tier (Sonnet) — cheap/fast for anon
 * traffic. shape_only gate: factual Q&A, not a companion-voice moment, so we skip
 * the judge but keep the grounding discipline in the prompt. Never invents.
 */
export default skill({
  id: "index_qa",
  model: "draft",
  tools: [],
  gate: "shape_only",
  prompt: ({ data }) => {
    const question = String(data.question ?? "");
    const scope = data.scopeLabel ? ` (the user is looking at ${data.scopeLabel})` : "";
    const roles = (data.roles as Array<Record<string, unknown>>) ?? [];
    const context = roles
      .map((r, i) => {
        const mh = Array.isArray(r.must_haves) ? (r.must_haves as string[]).slice(0, 5) : [];
        return [
          `[${i + 1}] ${r.role_title} — ${r.company}${r.archetype ? ` (${r.archetype})` : ""}`,
          r.location ? `    location: ${r.location}` : "",
          mh.length ? `    requires: ${mh.join("; ")}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");

    return {
      system: [
        "You are RO, answering a visitor's question about RoleOS's live index of senior roles.",
        "Answer ONLY from the ROLES below — they are what RO has actually read.",
        "If the answer isn't in them, say so plainly ('I don't see that in the Index right now') — never invent companies, requirements, salaries, or counts.",
        "Be concise and concrete (2-4 sentences or a short list). Reference specific roles/companies when relevant.",
        "Warm, candid, never salesy. End with ONE short line inviting them to share their profile so RO can score their actual fit — only if it fits naturally.",
      ].join(" "),
      user: `QUESTION${scope}: ${question}\n\nROLES:\n${context || "(no roles matched)"}\n\nAnswer from the roles above.`,
    };
  },
  expects: (t) => t.trim().length > 0,
});

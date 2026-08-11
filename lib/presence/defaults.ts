/**
 * The proven source set from the local console (social/signals/sources.json as
 * of 2026-08-11), offered as a one-click seed when a user has no sources yet.
 * Sources are rows, not code: after seeding, everything is edited from the
 * Sources view or SQL, never here.
 */

export interface DefaultSource {
  slug: string;
  platform: "linkedin" | "twitter" | "reddit";
  type: "keyword" | "author" | "company" | "title" | "industry" | "mentions";
  value: string;
  query?: string;
  enabled: boolean;
  note: string;
}

export const DEFAULT_SOURCES: DefaultSource[] = [
  {
    slug: "li-kw-evals", platform: "linkedin", type: "keyword", value: "LLM evals", enabled: true,
    note: "Priority keyword. High velocity, likely first to be promoted to a shorter interval by the fill-rate rule.",
  },
  { slug: "li-kw-agent-evals", platform: "linkedin", type: "keyword", value: "agent evals", enabled: true, note: "" },
  {
    slug: "li-kw-hitl", platform: "linkedin", type: "keyword", value: "human in the loop AI agents", enabled: true,
    note: "Week 1 post territory. 4.3% of target postings, so thin but exactly on-beat.",
  },
  {
    slug: "li-authors-tier-a", platform: "linkedin", type: "author",
    value: "bijit-ghosh-48281a78,hkotadia,chet2an,josh-reini,khalidraza", enabled: true,
    note: "VERIFIED 2026-08-11 by people-search, each confirmed against its headline. Two Bijit Ghoshs exist on LinkedIn; this is the right one. Batched at 5, the API maximum.",
  },
  {
    slug: "li-company-targets", platform: "linkedin", type: "company", value: "", enabled: false,
    note: "DISABLED: author_company requires numeric LinkedIn company IDs, not names (discovered live 2026-08-11). Needs an ID lookup for SoFi, BlackRock, Upstart, Plaid, Robinhood before it can run.",
  },
  {
    slug: "li-title-staff-pm", platform: "linkedin", type: "title", value: "Staff Product Manager",
    query: "AI agents evals", enabled: true,
    note: "author_title requires a query parameter too (discovered live 2026-08-11). Title narrows to senior practitioners; query keeps it on-beat.",
  },
  {
    slug: "x-kw-llm-evals", platform: "twitter", type: "keyword", value: "LLM evals", enabled: true,
    note: "Never bare 'evals' on X: it collides with prop-firm trading jargon, where an eval is a funded-account test.",
  },
  { slug: "x-kw-agent-evals", platform: "twitter", type: "keyword", value: "agent evals", enabled: true, note: "" },
  {
    slug: "x-kw-hitl", platform: "twitter", type: "keyword", value: "human in the loop agents", enabled: true,
    note: "X moves in hours, not days. Expect the fill-rate rule to shorten this one first.",
  },
  {
    slug: "li-authors-targets-1", platform: "linkedin", type: "author",
    value: "haley-e-irwin,isabella-zhu-68542710a,vidaekhlas,heather-jaconi,kexinwindywang", enabled: true,
    note: "Target-company people. Slugs captured from real search results 2026-08-10. Batched at 5, the API maximum.",
  },
  {
    slug: "li-authors-targets-2", platform: "linkedin", type: "author",
    value: "lmalberts,dslavina,lucaslin1,sharmanidhi93,xiangxiangmeng", enabled: true,
    note: "Target-company people. Slugs captured from real search results 2026-08-10. Batched at 5, the API maximum.",
  },
  {
    slug: "li-authors-targets-3", platform: "linkedin", type: "author",
    value: "olivereliu,sahijgadu", enabled: true,
    note: "Target-company people. Slugs captured from real search results 2026-08-10.",
  },
  {
    slug: "li-keyw-eval-harness", platform: "linkedin", type: "keyword", value: "eval harness", enabled: true,
    note: "Added from the console 2026-08-11.",
  },
];

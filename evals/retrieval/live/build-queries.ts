/**
 * One-shot labeler: derives the relevant role-id set for each query from the
 * REAL corpus using a TRANSPARENT rule (archetype label ± a keyword/seniority
 * constraint), then FREEZES the result to queries.json so the runner + CI are
 * reproducible and independent of this rule. Relevance is judged from the human
 * `archetype` label (and explicit text constraints), NOT from the retriever's
 * TF-IDF features — so the eval measures recovery, not a tautology.
 *
 *   npx tsx evals/retrieval/live/build-queries.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCorpus, type RoleDoc } from "./corpus.ts";

interface QuerySpec {
  id: string;
  query: string;
  facets: string[];
  /** Transparent relevance rule over a real role doc. */
  rule: (d: RoleDoc) => boolean;
}

const has = (d: RoleDoc, ...kw: string[]) => {
  const t = d.text.toLowerCase();
  return kw.some((k) => t.includes(k));
};

const SPECS: QuerySpec[] = [
  {
    id: "ai-product-manager",
    query: "AI product manager building LLM and agent products",
    facets: [
      "AI product manager building LLM and agent products",
      "machine learning model quality and evals",
      "generative AI features shipped to production",
    ],
    rule: (d) => d.archetype === "AI Product Manager",
  },
  {
    id: "ai-pm-llm-infra",
    query: "AI PM for LLM inference and model infrastructure platform",
    facets: [
      "AI PM for LLM inference and model infrastructure platform",
      "developer platform for large language models",
    ],
    rule: (d) =>
      d.archetype === "AI Product Manager" &&
      has(d, "llm", "inference", "model", "agent", "platform"),
  },
  {
    id: "technical-program-manager",
    query: "Technical program manager driving cross-functional delivery",
    facets: [
      "Technical program manager driving cross-functional delivery",
      "program management of engineering roadmaps and dependencies",
    ],
    rule: (d) => d.archetype === "Technical Program Manager",
  },
  {
    id: "growth-pm",
    query: "Growth product manager owning activation and retention experiments",
    facets: [
      "Growth product manager owning activation and retention experiments",
      "funnel optimization, A/B testing, conversion",
    ],
    rule: (d) => d.archetype === "Growth PM",
  },
  {
    id: "bizops-strategy",
    query: "Business operations and strategy, revenue and go-to-market analysis",
    facets: [
      "Business operations and strategy lead",
      "revenue operations, go-to-market, financial analysis",
    ],
    rule: (d) => d.archetype === "BizOps / Strategy & Ops",
  },
  {
    id: "chief-of-staff",
    query: "Chief of staff to a CEO or product leader",
    facets: ["Chief of staff to a CEO or product leader", "executive operations and planning"],
    rule: (d) => d.archetype === "Chief of Staff",
  },
  {
    id: "generalist-pm",
    query: "Generalist product manager owning a consumer product end to end",
    facets: [
      "Generalist product manager owning a consumer product end to end",
      "0 to 1 product ownership, roadmap, discovery",
    ],
    rule: (d) => d.archetype === "Generalist PM",
  },
  {
    id: "enterprise-technical-pm",
    query: "Technical PM for enterprise B2B SaaS platform with security and SSO",
    facets: [
      "Technical PM for enterprise B2B SaaS platform",
      "enterprise security, SSO, SCIM, admin and governance",
    ],
    rule: (d) => d.archetype === "Technical PM" && has(d, "enterprise", "sso", "b2b", "security"),
  },
  {
    id: "payments-fintech-pm",
    query: "Product manager for payments and fintech infrastructure",
    facets: [
      "Product manager for payments and fintech infrastructure",
      "payments, banking, financial compliance, risk",
    ],
    rule: (d) => has(d, "payment", "fintech", "banking", "financial") && d.archetype.includes("PM"),
  },
  {
    id: "data-platform-pm",
    query: "Product manager for data platform and analytics infrastructure",
    facets: [
      "Product manager for data platform and analytics infrastructure",
      "data pipelines, warehouse, analytics, observability",
    ],
    rule: (d) =>
      has(d, "data platform", "analytics", "data pipeline", "warehouse") &&
      d.archetype.includes("PM"),
  },
];

function main() {
  const corpus = loadCorpus();
  const cases = SPECS.map((s) => {
    const relevant = corpus.filter(s.rule).map((d) => d.id);
    return { id: s.id, query: s.query, facets: s.facets, relevant };
  });
  const empty = cases.filter((c) => c.relevant.length === 0);
  if (empty.length) throw new Error(`No relevant roles for: ${empty.map((c) => c.id).join(", ")}`);

  const out = {
    _comment:
      "FROZEN live-corpus eval labels. Each case: a real query, function-forward facets (for the multi-query union), and the relevant role-id set derived from the human `archetype` label + explicit text constraints (see build-queries.ts). Regenerate with: npx tsx evals/retrieval/live/build-queries.ts",
    k: 10,
    corpusSize: corpus.length,
    cases,
  };
  const path = fileURLToPath(new URL("./queries.json", import.meta.url));
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${cases.length} cases over ${corpus.length} roles → ${path}`);
  for (const c of cases) console.log(`  ${c.id.padEnd(26)} relevant=${c.relevant.length}`);
}

main();

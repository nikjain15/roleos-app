import { describe, it, expect } from "vitest";
import { isRelevantTitle } from "@/lib/ingest/relevance";

/**
 * Title relevance at enterprises, not just AI-native startups.
 *
 * Measured on live Workday boards (BlackRock, Citi, State Street, Vanguard): the
 * original filter passed ~9% of postings and dropped exactly the roles those
 * firms are worth sourcing for. Banks and asset managers title AI/ML work "Data
 * Scientist" or "Data Engineer", and pluralise "Head of Digital Products" — both
 * fell out. Widening "data"/"analytics"/"quantitative" roughly doubled the yield
 * (BlackRock 19 -> 44 in-scope), which is why the exclusions below matter more
 * than before.
 *
 * Superseded in part the same day: the scope pass removed hands-on engineering
 * and science from the index entirely (see relevance-scope.test.ts), so the
 * data-science titles this file once asserted as in-scope are now out. What
 * survives here is the enterprise *product* vocabulary — plural product
 * headings, platform owner, analytics management.
 */
describe("isRelevantTitle — enterprise/finance titles", () => {
  const IN = [
    "Analytics Manager",
    "Technical Product Manager, Data Strategy",
    "Director, Data Product Management",
    "Investments AI Enablement Lead",
    "Product Marketing Manager, ETFs", // product marketing is in scope as of the 2026-08-09 scope pass
  ];
  const OUT = [
    "Portfolio Manager, Core - Associate",
    "Investment Analyst",
    "Institutional Sales, AVP",
    // Hands-on engineering/science left scope on 2026-08-09 — the index is
    // product/program/ops/strategy. These were IN before that pass.
    "Data Scientist",
    "Senior Data Scientist, Quantitative Research",
    "Data Engineer",
    "Quantitative Researcher",
    "Machine Learning Engineer, Risk",
    "Data Analyst", // analyst is not a role word we source for
    "Data Entry Clerk",
    "Data Annotation Specialist",
    "AI Trainer",
  ];

  it.each(IN)("keeps %s", (t) => expect(isRelevantTitle(t)).toBe(true));
  it.each(OUT)("drops %s", (t) => expect(isRelevantTitle(t)).toBe(false));

  it("matches pluralised and qualified product headings", () => {
    // Enterprises write "Head of Digital Products"; startups write "Head of Product".
    expect(isRelevantTitle("Head of Digital Products")).toBe(true);
    expect(isRelevantTitle("Head of Product")).toBe(true);
    expect(isRelevantTitle("Director of Consumer Products")).toBe(true);
    expect(isRelevantTitle("Platform Owner, Client Onboarding")).toBe(true);
  });

  it("does not let the widened data term pull in data-centre facilities roles", () => {
    // "data" + "engineer" would otherwise match these outright.
    expect(isRelevantTitle("Data Center Operations Engineer")).toBe(false);
    expect(isRelevantTitle("Data Centre Engineer")).toBe(false);
    expect(isRelevantTitle("Data Center Facilities Technician")).toBe(false);
  });
});

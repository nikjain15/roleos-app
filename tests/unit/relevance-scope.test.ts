import { describe, it, expect } from "vitest";
import { isRelevantTitle } from "@/lib/ingest/relevance";

/**
 * Index scope: product, program, ops, strategy — not engineering.
 *
 * The Index page describes "senior product, program, ops and strategy roles",
 * but 41% of what it displayed was engineering, science or design, and
 * "AI / ML Engineer" (718) was nearly twice the largest PM bucket. The AI-term-
 * plus-role-word rule accepted any engineering title that mentioned AI. Those
 * roles were archived and the rule narrowed.
 */
describe("isRelevantTitle — scope", () => {
  const IN = [
    // the families the filter was silently missing
    "Product Operations Manager", "Director, Product Operations", "Product Ops Lead",
    "Portfolio Director", "Delivery Director", "Transformation Director",
    "Director, Strategic Partnerships", "Developer Relations Manager", "Head of Developer Experience",
    "Product Marketing Manager, AI", "Director of Product Marketing",
    // core, unchanged
    "AI Product Manager", "Technical Program Manager", "Chief of Staff", "Head of AI Enablement",
    "Responsible AI Lead", "Director, AI Policy", "Head of Product Design", "Product Designer",
  ];
  const OUT = [
    "Senior AI/ML Engineer", "Machine Learning Engineer, Risk", "Agentic AI Engineer",
    "Applied Scientist", "Research Scientist, LLM", "AI Infrastructure Engineer",
    "Data Scientist", "Data Engineer", "Software Engineer", "Engineering Manager, ML",
    "AI Engineer Lead", "Account Executive", "AI Trainer", "Data Annotation Specialist",
  ];
  it.each(IN)("keeps %s", (t) => expect(isRelevantTitle(t)).toBe(true));
  it.each(OUT)("drops %s", (t) => expect(isRelevantTitle(t)).toBe(false));

  it("keeps forward-deployed and solutions engineering, the one engineering path we want", () => {
    // Deliberate carve-out: docs/FDE_JOURNEY.md treats FDE as an adjacent path.
    expect(isRelevantTitle("Forward Deployed Engineer")).toBe(true);
    expect(isRelevantTitle("Solutions Engineer, AI")).toBe(true);
    expect(isRelevantTitle("Solutions Architect, Enterprise")).toBe(true);
  });

  it("resolves the product-marketing contradiction in one direction", () => {
    // "Director of Product Marketing" used to pass while the manager title failed.
    expect(isRelevantTitle("Director of Product Marketing")).toBe(true);
    expect(isRelevantTitle("Product Marketing Manager, AI")).toBe(true);
  });
});

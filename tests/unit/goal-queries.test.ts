import { describe, it, expect } from "vitest";
import { goalQueryTexts } from "@/lib/goal";

/**
 * Slice W7 — goal-derived recall queries ("also open to" wiring). Pure: the
 * target phrase anchors, domains fan out, also_open_to widens; junk never leaks
 * into the embedding queries.
 */
describe("goalQueryTexts", () => {
  it("builds the target phrase and the also-open-to widener", () => {
    const qs = goalQueryTexts({
      target: { seniority: "Senior", archetype: "AI Product Manager" },
      also_open_to: { text: "BizOps, Chief of Staff" },
    });
    expect(qs).toEqual(["Senior AI Product Manager", "BizOps, Chief of Staff"]);
  });

  it("fans domains out over the target phrase, capped at 3", () => {
    const qs = goalQueryTexts({
      target: { archetype: "PM", domains: ["fintech", "health", "devtools", "extra"] },
      also_open_to: null,
    });
    expect(qs).toEqual(["PM", "PM fintech", "PM health", "PM devtools"]);
  });

  it("handles null goal, empty target, junk also_open_to — never junk queries", () => {
    expect(goalQueryTexts(null)).toEqual([]);
    expect(goalQueryTexts({ target: {}, also_open_to: null })).toEqual([]);
    expect(goalQueryTexts({ target: {}, also_open_to: { text: "  " } })).toEqual([]);
    expect(goalQueryTexts({ target: {}, also_open_to: { text: 42 as unknown as string } })).toEqual([]);
    // domains without a target phrase don't produce naked domain queries
    expect(goalQueryTexts({ target: { domains: ["fintech"] }, also_open_to: null })).toEqual([]);
  });

  it("dedupes and truncates oversized text", () => {
    const long = "x".repeat(500);
    const qs = goalQueryTexts({ target: { archetype: "PM" }, also_open_to: { text: long } });
    expect(qs[1].length).toBeLessThanOrEqual(300);
    expect(goalQueryTexts({ target: { archetype: "PM" }, also_open_to: { text: "PM" } })).toEqual(["PM"]);
  });
});

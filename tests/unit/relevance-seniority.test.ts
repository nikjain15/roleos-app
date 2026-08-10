import { describe, it, expect } from "vitest";
import { isRelevantTitle } from "@/lib/ingest/relevance";

/**
 * Hard vs domain exclusions (2026-08-10).
 *
 * CORE_TITLE returned true before the exclusions ran, so any off-target title
 * containing a product/program phrase walked in: "Product Management Intern",
 * "Campus Product Manager", "Product Marketing Ambassador". The corpus is
 * scoped to senior product/program/ops/strategy roles, so the exclusion set is
 * now split — HARD (what the job IS: intern, campus, ambassador, labeling,
 * teaching, clerical) runs first and nothing overrides it; DOMAIN (what the job
 * SERVES: sales, marketing, support, recruiting) stays overridable by a core
 * title. Measured against the live corpus: 40 of 3,251 passing rows (30 unique
 * titles) newly drop, all interns/campus/ambassador/annotation roles, and
 * nothing newly passes.
 */
describe("isRelevantTitle — hard exclusions beat core titles", () => {
  const OUT = [
    // the four titles that motivated the split
    "Product Management Intern",
    "Product Manager Intern",
    "Product Marketing Ambassador",
    "Campus Product Manager",
    // the same leak across the other core phrases and the FDE carve-out
    "Product Manager Summer 2027 Intern",
    "Business Operations Intern",
    "Chief of Staff Associate Intern",
    "Product Designer, Internship",
    "Developer Relations & Technical Content Intern",
    "Forward Deployed Software Engineer, Internship",
    "Solution Engineer, Intern",
    "Program Manager, Data Entry",
    "[Annotations] Operations Program Manager",
    "Product Manager, Tutor Marketplace",
  ];
  it.each(OUT)("drops %s", (t) => expect(isRelevantTitle(t)).toBe(false));

  it("still lets a core title override a domain word", () => {
    // the case the original ordering existed to protect — a PM role that merely
    // names sales/marketing/support/recruiting as the domain it serves
    expect(isRelevantTitle("Product Manager, Sales Tools")).toBe(true);
    expect(isRelevantTitle("Director of Product Marketing")).toBe(true);
    expect(isRelevantTitle("Group Product Manager, Customer Support")).toBe(true);
    expect(isRelevantTitle("Product Lead, Recruiting Platform")).toBe(true);
  });

  it("keeps senior roles whose words merely resemble a hard exclusion", () => {
    // \bintern\b must not reach "International"; \btrainer\b not "Training"
    expect(isRelevantTitle("Product Manager, International Payments")).toBe(true);
    expect(isRelevantTitle("Product Manager, Training Platform")).toBe(true);
    expect(isRelevantTitle("Head of Internal Products")).toBe(true);
  });

  it("leaves the domain exclusions off-target when no core title claims them", () => {
    expect(isRelevantTitle("Enterprise Account Executive, AI")).toBe(false);
    expect(isRelevantTitle("Technical Recruiter, AI")).toBe(false);
  });
});

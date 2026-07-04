import { describe, it, expect } from "vitest";
import companyBrief from "@/agent/skills/company_brief";

/** X2 — the company_brief skill contract. */
describe("company_brief skill", () => {
  it("draft tier, full gate, no tools (zero egress by construction)", () => {
    expect(companyBrief.model).toBe("draft");
    expect(companyBrief.gate).toBe("full");
    expect(companyBrief.tools).toEqual([]);
    expect(companyBrief.structured).toBe(true);
  });

  it("prompt forbids asserting facts outside the sources and demands unknowns", () => {
    const { system, user } = companyBrief.prompt({
      userId: "u1",
      data: {
        company: { name: "Acme", sector: "fintech" },
        postings: [{ role_title: "Staff PM", must_haves: ["payments"] }],
        role: { role_title: "Staff PM" },
      },
    });
    expect(system).toContain("NEVER assert funding, news, culture");
    expect(system).toContain("unknowns");
    expect(user).toContain('"sector":"fintech"');
  });

  it("expects: overview + unknowns + prep_pointers arrays, rejects junk", () => {
    const ok = JSON.stringify({
      overview: "Acme builds payments infrastructure per its postings.",
      hiring_signal: "Heavy PM hiring.",
      what_they_value: ["payments"],
      comp_read: "Comp not stated.",
      prep_pointers: ["Know their must-haves"],
      unknowns: ["Funding stage"],
    });
    expect(companyBrief.expects!(ok)).toBe(true);
    expect(companyBrief.expects!(JSON.stringify({ overview: "short" }))).toBe(false);
    expect(companyBrief.expects!(JSON.stringify({ unknowns: [], prep_pointers: [] }))).toBe(false);
    expect(companyBrief.expects!("junk")).toBe(false);
  });
});

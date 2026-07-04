import { describe, it, expect } from "vitest";
import {
  parseConnectionsCsv,
  normalizeCompany,
  sameCompany,
  titleRank,
  warmPaths,
  CONNECTIONS_CAP,
  type ConnectionRow,
} from "@/lib/connections";
import introAsk from "@/agent/skills/intro_ask";

/**
 * X6 — referral finder, the pure parts: LinkedIn-export parsing (the user's
 * own data), company matching, path ranking, and the intro-ask skill contract
 * (truth-gated to profile + the user's own relationship note).
 */

const LINKEDIN_CSV = [
  "Notes:",
  '"When exporting your connection data, you may be missing information."',
  "",
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  'Jane,Doe,https://x/janed,jane@x.com,"Acme, Inc.",Staff PM,01 Jan 2024',
  "Sam,Lee,,,Beam Labs,VP Engineering,02 Feb 2023",
  ",,,,NoName Co,Engineer,03 Mar 2023", // no name → dropped
  "Ana,Ruiz,,,,,", // name only → kept, nulls elsewhere
].join("\n");

describe("parseConnectionsCsv", () => {
  it("parses LinkedIn's export incl. notes preamble and quoted commas", () => {
    const rows = parseConnectionsCsv(LINKEDIN_CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ name: "Jane Doe", company: "Acme, Inc.", title: "Staff PM", email: "jane@x.com" });
    expect(rows[2]).toEqual({ name: "Ana Ruiz", company: null, title: null, email: null });
  });

  it("returns [] on junk that isn't a connections export", () => {
    expect(parseConnectionsCsv("just,some,random\nrows,here,ok")).toEqual([]);
    expect(parseConnectionsCsv("")).toEqual([]);
  });

  it("honors the cap — a list, not a warehouse", () => {
    const many = [
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      ...Array.from({ length: 50 }, (_, i) => `P${i},Q,,,C${i},T,`),
    ].join("\n");
    expect(parseConnectionsCsv(many, 10)).toHaveLength(10);
    expect(CONNECTIONS_CAP).toBe(5000);
  });
});

describe("company matching", () => {
  it("normalizes suffixes and punctuation", () => {
    expect(normalizeCompany("Acme, Inc.")).toBe("acme");
    expect(normalizeCompany("Beam Labs GmbH")).toBe("beam labs");
    expect(sameCompany("Acme, Inc.", "ACME")).toBe(true);
    expect(sameCompany("Beam Labs", "Beam Labs, Ltd.")).toBe(true);
  });

  it("containment needs ≥4 chars — 'Co' never matches everything", () => {
    expect(sameCompany("Stripe", "Stripe Payments")).toBe(true);
    expect(sameCompany("Am", "Amazon")).toBe(false);
    expect(sameCompany("", "Acme")).toBe(false);
    expect(sameCompany(null, "Acme")).toBe(false);
  });
});

describe("warmPaths — honest evidence, useful order", () => {
  const c = (id: string, over: Partial<ConnectionRow>): ConnectionRow => ({
    id,
    name: `Person ${id}`,
    company: "Acme",
    title: null,
    email: null,
    source: "csv",
    note: "",
    ...over,
  });

  it("direct employer matches only; manual people lead, then seniority", () => {
    const paths = warmPaths(
      [
        c("1", { title: "Engineer" }),
        c("2", { title: "VP Product" }),
        c("3", { source: "manual", title: "Analyst", note: "old teammate" }),
        c("4", { company: "Other Corp", title: "CEO" }), // wrong company → out
      ],
      "Acme, Inc.",
    );
    expect(paths.map((p) => p.connection.id)).toEqual(["3", "2", "1"]);
    expect(paths[0].evidence).toContain("you added them");
    expect(paths[1].evidence).toContain("works at Acme");
  });

  it("no company or no matches → empty, capped at 5 otherwise", () => {
    expect(warmPaths([c("1", {})], null)).toEqual([]);
    expect(warmPaths([c("1", { company: "Zeta" })], "Acme")).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => c(String(i), {}));
    expect(warmPaths(many, "Acme")).toHaveLength(5);
  });

  it("titleRank reads seniority sanely", () => {
    expect(titleRank("VP Engineering")).toBe(3);
    expect(titleRank("Staff Product Manager")).toBe(2);
    expect(titleRank("Senior Analyst")).toBe(1);
    expect(titleRank("Barista")).toBe(0);
    expect(titleRank(null)).toBe(0);
  });
});

describe("intro_ask skill contract", () => {
  const input = {
    userId: "u1",
    data: {
      role: { company: "Acme", role_title: "Staff PM" },
      connection: { name: "Jane Doe", title: "Staff PM", company: "Acme", note: "" },
      profile: "Senior PM, 9 years, payments.",
    },
  };

  it("is a full-gate, structured draft skill with no tools", () => {
    expect(introAsk.gate).toBe("full");
    expect(introAsk.structured).toBe(true);
    expect(introAsk.tools).toEqual([]);
  });

  it("the prompt forbids invented relationships and demands an easy out", () => {
    const { system, user } = introAsk.prompt(input);
    expect(system).toMatch(/do NOT invent shared history/i);
    expect(system).toMatch(/easy out/i);
    expect(system).toMatch(/never pressure/i);
    expect(user).toContain("(none — open plainly, invent nothing)");
  });

  it("expects: strict JSON with subject + a real body", () => {
    expect(introAsk.expects!('{"subject":"Quick ask","body":"' + "x".repeat(80) + '"}')).toBe(true);
    expect(introAsk.expects!('{"subject":"","body":"hi"}')).toBe(false);
    expect(introAsk.expects!("not json")).toBe(false);
  });
});

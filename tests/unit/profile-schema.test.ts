import { describe, it, expect } from "vitest";
import {
  parseCanonicalProfile,
  emptyProfile,
  PROFILE_SCHEMA_VERSION,
} from "@/lib/profile-schema";

const AT = "2026-07-25T00:00:00.000Z";

describe("parseCanonicalProfile", () => {
  it("coerces a well-formed object and stamps provenance", () => {
    const p = parseCanonicalProfile(
      {
        identity: { name: "Nik", headline: "Senior AI PM", links: { github: "https://github.com/nik" } },
        experience: [{ title: "PM", company: "CredR", highlights: ["scaled 10x"], confidence: 0.9 }],
        skills: [{ canonical: "Machine Learning", source: "github" }],
        projects: [{ name: "roleos", tech: ["TypeScript"], stars: 12 }],
        signals: { domains: ["AI"], strengths: ["0-to-1"], target: { role: "AI PM", cares_about: ["shipping"] } },
      },
      { defaultSource: "resume", at: AT },
    );
    expect(p.version).toBe(PROFILE_SCHEMA_VERSION);
    expect(p.identity.name).toEqual({ value: "Nik", source: "resume", confidence: 0.6, at: AT });
    expect(p.experience[0]).toMatchObject({ title: "PM", company: "CredR", confidence: 0.9 });
    expect(p.skills[0]).toMatchObject({ canonical: "Machine Learning", source: "github" });
    expect(p.projects[0]).toMatchObject({ name: "roleos", stars: 12 });
    expect(p.signals.target?.cares_about).toEqual(["shipping"]);
  });

  it("drops malformed rows (missing required fields) without throwing", () => {
    const p = parseCanonicalProfile(
      {
        experience: [{ title: "PM" /* no company */ }, { title: "Eng", company: "X", highlights: [] }],
        skills: [{ raw: "no canonical" }, { canonical: "Python" }],
        education: [{ degree: "no school" }, { school: "IITB" }],
      },
      { defaultSource: "linkedin", at: AT },
    );
    expect(p.experience).toHaveLength(1);
    expect(p.experience[0].company).toBe("X");
    expect(p.skills).toHaveLength(1);
    expect(p.skills[0].canonical).toBe("Python");
    expect(p.education).toHaveLength(1);
    expect(p.education[0].school).toBe("IITB");
  });

  it("never throws on hostile / empty / non-object input", () => {
    for (const bad of [null, undefined, 42, "string", [], { experience: "not-array" }]) {
      const p = parseCanonicalProfile(bad, { defaultSource: "user", at: AT });
      expect(p.version).toBe(PROFILE_SCHEMA_VERSION);
      expect(Array.isArray(p.experience)).toBe(true);
      expect(Array.isArray(p.skills)).toBe(true);
    }
  });

  it("clamps confidence out of range and rejects invalid sources", () => {
    const p = parseCanonicalProfile(
      { skills: [{ canonical: "Go", confidence: 5, source: "twitter" }] },
      { defaultSource: "github", at: AT },
    );
    expect(p.skills[0].confidence).toBe(0.6); // out-of-range → default
    expect(p.skills[0].source).toBe("github"); // invalid source → default
  });

  it("caps array sizes", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ canonical: `s${i}` }));
    const p = parseCanonicalProfile({ skills: many }, { defaultSource: "resume", at: AT });
    expect(p.skills.length).toBeLessThanOrEqual(60);
  });

  it("emptyProfile is a valid base", () => {
    const p = emptyProfile();
    expect(p.version).toBe(PROFILE_SCHEMA_VERSION);
    expect(p.experience).toEqual([]);
    expect(p.signals.domains).toEqual([]);
  });
});

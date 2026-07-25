import { describe, it, expect } from "vitest";
import { linkedinToProfile, githubToProfile, mergeProfiles } from "@/lib/profile-map";
import { emptyProfile } from "@/lib/profile-schema";

const AT = "2026-07-25T00:00:00.000Z";

describe("linkedinToProfile", () => {
  it("maps structured LinkedIn → high-confidence canonical facts", () => {
    const p = linkedinToProfile(
      {
        basic_info: {
          fullname: "Nik Jain",
          headline: "Senior AI PM",
          location: { full: "San Francisco" },
          about: "I build AI products.",
          top_skills: ["Product", "ML"],
        },
        experience: [{ title: "PM", company: "CredR", duration: "2015 - 2021", description: "Scaled 10x." }],
        education: [{ school: "IITB", degree: "B.Tech", field_of_study: "CS", duration: "2011" }],
      },
      AT,
    );
    expect(p.identity.name).toEqual({ value: "Nik Jain", source: "linkedin", confidence: 0.95, at: AT });
    expect(p.identity.headline?.value).toBe("Senior AI PM");
    expect(p.identity.location?.value).toBe("San Francisco");
    expect(p.skills.map((s) => s.canonical)).toEqual(["Product", "ML"]);
    expect(p.experience[0]).toMatchObject({ title: "PM", company: "CredR", start: "2015", end: "2021", source: "linkedin" });
    expect(p.experience[0].highlights).toEqual(["Scaled 10x."]);
    expect(p.education[0]).toMatchObject({ school: "IITB", degree: "B.Tech", field: "CS" });
  });

  it("handles comma-string skills and missing/partial fields", () => {
    const p = linkedinToProfile(
      { basic_info: { top_skills: "Python, SQL; Go" }, experience: [{ title: "only title" }] },
      AT,
    );
    expect(p.skills.map((s) => s.canonical)).toEqual(["Python", "SQL", "Go"]);
    expect(p.experience).toHaveLength(0); // no company → dropped
    expect(p.identity.name).toBeUndefined();
  });
});

describe("githubToProfile", () => {
  it("maps repos → projects (top by stars) and languages → skills", () => {
    const p = githubToProfile(
      { name: "Nik", login: "nik", bio: "builder", location: "SF" },
      [
        { name: "roleos", description: "job agent", language: "TypeScript", stargazers_count: 42, html_url: "u1" },
        { name: "ml-thing", language: "Python", stargazers_count: 5 },
        { name: "py-two", language: "Python", stargazers_count: 1 },
        { name: "aforked", language: "Go", stargazers_count: 999, fork: true },
        { name: "archived", language: "Rust", stargazers_count: 999, archived: true },
      ],
      AT,
    );
    // forks/archived excluded from projects
    expect(p.projects.map((x) => x.name)).toEqual(["roleos", "ml-thing", "py-two"]);
    expect(p.projects[0]).toMatchObject({ name: "roleos", stars: 42, tech: ["TypeScript"], source: "github" });
    // languages by repo count: Python (2) before TypeScript (1); no Go/Rust (forked/archived)
    expect(p.skills.map((s) => s.canonical)).toEqual(["Python", "TypeScript"]);
    expect(p.identity.links.github).toBe("https://github.com/nik");
    expect(p.signals.strengths).toContain("builder");
  });

  it("is safe on an empty account", () => {
    const p = githubToProfile({ login: "ghost" }, [], AT);
    expect(p.projects).toEqual([]);
    expect(p.skills).toEqual([]);
    expect(p.identity.links.github).toBe("https://github.com/ghost");
  });
});

describe("mergeProfiles", () => {
  it("keeps the highest-confidence identity fact and unions links", () => {
    const li = linkedinToProfile({ basic_info: { fullname: "Nik Jain", headline: "Senior AI PM" } }, AT);
    const gh = githubToProfile({ name: "nik", login: "nik" }, [], AT);
    const merged = mergeProfiles([gh, li]);
    // LinkedIn name (0.95) beats GitHub name (0.85) regardless of order
    expect(merged.identity.name?.value).toBe("Nik Jain");
    expect(merged.identity.name?.source).toBe("linkedin");
    expect(merged.identity.links.github).toBe("https://github.com/nik");
  });

  it("dedupes skills to the taxonomy keeping the higher confidence", () => {
    const li = linkedinToProfile({ basic_info: { top_skills: ["Python"] } }, AT); // conf 0.8
    const gh = githubToProfile({ login: "x" }, [{ name: "r", language: "Python", stargazers_count: 1 }], AT); // conf 0.9
    const merged = mergeProfiles([li, gh]);
    const py = merged.skills.filter((s) => s.canonical.toLowerCase() === "python");
    expect(py).toHaveLength(1);
    expect(py[0].source).toBe("github"); // 0.9 > 0.8
  });

  it("dedupes experience by title+company and unions signals", () => {
    const a = emptyProfile();
    a.experience.push({ title: "PM", company: "CredR", highlights: ["a"], source: "linkedin", confidence: 0.9 });
    a.signals.domains.push("AI");
    const b = emptyProfile();
    b.experience.push({ title: "pm", company: "credr", highlights: ["b"], source: "resume", confidence: 0.5 });
    b.signals.domains.push("Fintech");
    const merged = mergeProfiles([a, b]);
    expect(merged.experience).toHaveLength(1);
    expect(merged.experience[0].confidence).toBe(0.9); // higher-confidence copy kept
    expect(merged.signals.domains.sort()).toEqual(["AI", "Fintech"]);
  });

  it("returns an empty-but-valid profile for no sources", () => {
    const merged = mergeProfiles([]);
    expect(merged.experience).toEqual([]);
    expect(merged.version).toBe(1);
  });
});
